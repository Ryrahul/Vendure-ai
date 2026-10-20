import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { formatPrice } from '../../constants';
import { backtest, demandRate, demandStdDev, forecastSeries } from './forecast';
import type { InsightCard, InventoryPlanItem } from './insight-cards';
import { DAY, SalesAnalyticsService } from './sales-analytics.service';
import { DEFAULT_LEAD_TIME_DAYS, StoreProfileService } from './store-profile.service';

/** Tool result for insights: a compact text summary for the model, and a card for the chat UI. */
export interface InsightToolResult {
    summary: string;
    insight?: InsightCard;
}

const Z_95 = 1.645;
const MAX_PLAN_VARIANTS = 200;

/**
 * Turns sales data into the numbers the admin assistant reports: summaries, trends,
 * a sales forecast and an inventory plan. All figures are computed here — the model
 * only explains them.
 */
@Injectable()
export class BusinessInsightsService {
    constructor(
        private analytics: SalesAnalyticsService,
        private storeProfile: StoreProfileService,
    ) {}

    async salesSummary(ctx: RequestContext, days: number): Promise<InsightToolResult> {
        const s = await this.analytics.summary(ctx, days);
        const cur = s.currencyCode;
        const change = (now: number, before: number) => (before ? `${(((now - before) / before) * 100).toFixed(1)}%` : 'n/a (no prior sales)');
        return {
            summary:
                `Last ${days} days: revenue ${formatPrice(s.revenue, cur)} (${change(s.revenue, s.previous.revenue)} vs previous ${days} days), ` +
                `${s.orders} orders (${change(s.orders, s.previous.orders)}), average order ${formatPrice(s.averageOrderValue, cur)}, ` +
                `${s.unitsSold} units, ${s.customers} customers. Revenue is product sales incl. tax after discounts, excl. shipping.`,
            insight: { type: 'salesSummary', ...s },
        };
    }

    async salesTrend(ctx: RequestContext, days: number, granularity: 'day' | 'week' | 'month'): Promise<InsightToolResult> {
        const daily = await this.analytics.dailySales(ctx, days);
        const buckets = new Map<string, { label: string; revenue: number; orders: number }>();
        for (const d of daily) {
            const label = granularity === 'day' ? d.date : granularity === 'week' ? weekStart(d.date) : d.date.slice(0, 7);
            const b = buckets.get(label) ?? { label, revenue: 0, orders: 0 };
            b.revenue += d.revenue;
            b.orders += d.orders;
            buckets.set(label, b);
        }
        const points = [...buckets.values()];
        const cur = ctx.channel.defaultCurrencyCode;
        const best = points.reduce((a, b) => (b.revenue > a.revenue ? b : a), points[0]);
        return {
            summary:
                `${granularity}ly sales for the last ${days} days: ` +
                points.map(p => `${p.label}: ${formatPrice(p.revenue, cur)} (${p.orders} orders)`).slice(-12).join('; ') +
                (best ? `. Best ${granularity}: ${best.label}.` : ''),
            insight: { type: 'salesTrend', currencyCode: cur, granularity, points },
        };
    }

    async forecastSales(ctx: RequestContext, horizonDays: number, historyDays: number): Promise<InsightToolResult> {
        const history = await this.analytics.dailySales(ctx, historyDays);
        const cur = ctx.channel.defaultCurrencyCode;
        const totalOrders = history.reduce((s, d) => s + d.orders, 0);
        if (totalOrders < 5) {
            return { summary: `Not enough sales history to forecast: only ${totalOrders} orders in the last ${historyDays} days. A forecast needs at least a few weeks of orders.` };
        }
        // Start at the first day with sales so a long empty lead-in doesn't drag the forecast down.
        const firstSale = history.findIndex(d => d.revenue > 0);
        const usable = history.slice(Math.max(0, firstSale));
        const revenue = forecastSeries(usable.map(d => d.revenue), horizonDays);
        const accuracy = backtest(usable.map(d => d.revenue), 14);

        const lastDate = new Date(`${history[history.length - 1].date}T00:00:00Z`);
        const forecast = revenue.values.map((v, i) => ({
            date: new Date(lastDate.getTime() + (i + 1) * DAY).toISOString().slice(0, 10),
            revenue: Math.round(v),
            lower: Math.round(revenue.lower[i]),
            upper: Math.round(revenue.upper[i]),
        }));
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        // Orders follow from revenue at the recent average order value, so the two figures agree.
        const recent = history.slice(-Math.max(horizonDays, 28));
        const recentOrders = sum(recent.map(d => d.orders));
        const recentAov = recentOrders ? sum(recent.map(d => d.revenue)) / recentOrders : 0;
        const totals = {
            forecastRevenue: Math.round(revenue.total.value),
            lower: Math.round(revenue.total.lower),
            upper: Math.round(revenue.total.upper),
            forecastOrders: recentAov ? Math.round(revenue.total.value / recentAov) : 0,
            previousPeriodRevenue: sum(history.slice(-horizonDays).map(d => d.revenue)),
        };
        const change = totals.previousPeriodRevenue
            ? ` (${(((totals.forecastRevenue - totals.previousPeriodRevenue) / totals.previousPeriodRevenue) * 100).toFixed(1)}% vs the last ${horizonDays} days)`
            : '';
        const accuracyText =
            accuracy.totalError != null
                ? `Tested on ${accuracy.windows} past ${accuracy.days}-day period(s) of real sales, the forecast total was off by about ${(accuracy.totalError * 100).toFixed(0)}% on average` +
                  (accuracy.wape != null ? ` (individual days vary much more, about ±${(accuracy.wape * 100).toFixed(0)}%, so don't plan around single days).` : '.')
                : 'Too little history to measure accuracy.';
        return {
            summary:
                `Forecast for the next ${horizonDays} days (${forecast[0].date} to ${forecast[forecast.length - 1].date}): ` +
                `revenue about ${formatPrice(totals.forecastRevenue, cur)}${change}, likely range ${formatPrice(totals.lower, cur)}–${formatPrice(totals.upper, cur)}, ` +
                `about ${totals.forecastOrders} orders. Method: ${revenue.method} on ${usable.length} days of history. ${accuracyText} ` +
                'Statistical projection of past sales: it does not know about upcoming promotions, holidays or stock-outs.',
            insight: {
                type: 'forecast',
                currencyCode: cur,
                horizonDays,
                method: revenue.method,
                backtest: { days: accuracy.days, wape: accuracy.wape, totalError: accuracy.totalError },
                history: history.slice(-Math.min(90, history.length)).map(d => ({ date: d.date, revenue: d.revenue })),
                forecast,
                totals,
            },
        };
    }

    async inventoryPlan(ctx: RequestContext, horizonDays: number, leadTimeOverride?: number): Promise<InsightToolResult> {
        const profile = await this.storeProfile.get(ctx);
        const leadTimeDays = leadTimeOverride ?? profile?.supplierLeadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
        const demand = await this.analytics.variantDemand(ctx, 120);
        if (!demand.length) {
            return { summary: 'No sales in the last 120 days, so there is no demand history to plan inventory from.' };
        }
        const ranked = demand
            .map(d => ({ ...d, rate: demandRate(d.dailyUnits), sd: demandStdDev(d.dailyUnits) }))
            .sort((a, b) => b.rate - a.rate)
            .slice(0, MAX_PLAN_VARIANTS);

        const items: InventoryPlanItem[] = [];
        for (const d of ranked) {
            const available = await this.analytics.saleableStock(ctx, d.variantId);
            const forecastDemand = d.rate * horizonDays;
            const safetyStock = Z_95 * d.sd * Math.sqrt(Math.max(1, leadTimeDays));
            const reorderPoint = d.rate * leadTimeDays + safetyStock;
            if (available == null) {
                items.push({ variantId: d.variantId, name: d.name, sku: d.sku, available: null, dailyDemand: round1(d.rate), forecastDemand: Math.round(forecastDemand), daysOfCover: null, stockoutDate: null, suggestedOrderQty: 0, status: 'not-tracked' });
                continue;
            }
            const daysOfCover = d.rate > 0 ? available / d.rate : null;
            const suggestedOrderQty = Math.max(0, Math.ceil(d.rate * (leadTimeDays + horizonDays) + safetyStock - available));
            const status: InventoryPlanItem['status'] =
                available <= reorderPoint
                    ? 'reorder-now'
                    : daysOfCover != null && daysOfCover < leadTimeDays + 7
                      ? 'reorder-soon'
                      : daysOfCover != null && daysOfCover > horizonDays * 4
                        ? 'overstock'
                        : 'ok';
            items.push({
                variantId: d.variantId,
                name: d.name,
                sku: d.sku,
                available,
                dailyDemand: round1(d.rate),
                forecastDemand: Math.round(forecastDemand),
                daysOfCover: daysOfCover == null ? null : Math.round(daysOfCover),
                stockoutDate: daysOfCover == null ? null : new Date(Date.now() + daysOfCover * DAY).toISOString().slice(0, 10),
                suggestedOrderQty: status === 'reorder-now' || status === 'reorder-soon' ? suggestedOrderQty : 0,
                status,
            });
        }
        const order = { 'reorder-now': 0, 'reorder-soon': 1, ok: 2, overstock: 3, 'not-tracked': 4 } as const;
        items.sort((a, b) => order[a.status] - order[b.status] || (a.daysOfCover ?? 1e9) - (b.daysOfCover ?? 1e9));
        const count = (s: InventoryPlanItem['status']) => items.filter(i => i.status === s).length;
        const urgent = items.filter(i => i.status === 'reorder-now' || i.status === 'reorder-soon').slice(0, 15);
        return {
            summary:
                `Inventory plan for the next ${horizonDays} days with a ${leadTimeDays}-day supplier lead time` +
                `${leadTimeOverride == null && profile?.supplierLeadTimeDays == null ? ' (assumed — ask the admin for their real lead time)' : ''}: ` +
                `${count('reorder-now')} to reorder now, ${count('reorder-soon')} soon, ${count('ok')} fine, ${count('overstock')} overstocked, ${count('not-tracked')} not stock-tracked. ` +
                (urgent.length
                    ? 'Most urgent: ' + urgent.map(i => `"${i.name}" (SKU ${i.sku}): ${i.available} in stock, ~${i.dailyDemand}/day, ${i.daysOfCover ?? '∞'} days left, order ${i.suggestedOrderQty}`).join('; ') + '. '
                    : '') +
                'Demand = recency-weighted daily sales rate; safety stock covers 95% of demand variation over the lead time; order quantity covers lead time + the planning period.',
            insight: { type: 'inventoryPlan', horizonDays, leadTimeDays, items: items.slice(0, 50) },
        };
    }

    async topProducts(ctx: RequestContext, days: number, limit: number, sortBy: 'revenue' | 'units'): Promise<InsightToolResult> {
        const { items, truncated } = await this.analytics.topProducts(ctx, days, limit, sortBy);
        const cur = ctx.channel.defaultCurrencyCode;
        return {
            summary: items.length
                ? `Top ${items.length} products by ${sortBy} in the last ${days} days: ` +
                  items
                          .map(
                              (p, i) =>
                                  `${i + 1}. ${p.name} — ${p.unitsSold} units sold, ${formatPrice(p.revenue, cur)} total revenue` +
                                  (p.unitsSold ? ` (average selling price ${formatPrice(Math.round(p.revenue / p.unitsSold), cur)} per unit)` : ''),
                          )
                          .join('; ') +
                  (truncated ? ' (based on the most recent 50,000 order lines)' : '')
                : `No sales in the last ${days} days.`,
            insight: { type: 'topProducts', currencyCode: cur, days, sortBy, items },
        };
    }

    async customerLocations(ctx: RequestContext, days: number): Promise<InsightToolResult> {
        const geo = await this.analytics.customerGeography(ctx, days);
        const fmt = (xs: Array<{ location: string; orders: number }>) => xs.slice(0, 5).map(x => `${x.location} (${x.orders})`).join(', ') || 'none';
        return {
            summary: geo.ordersWithAddress
                ? `Where orders shipped in the last ${days} days (${geo.ordersWithAddress} orders with an address). Countries: ${fmt(geo.countries)}. Regions: ${fmt(geo.regions)}. Cities: ${fmt(geo.cities)}.`
                : `No orders with a shipping address in the last ${days} days.`,
            insight: { type: 'customerLocations', currencyCode: ctx.channel.defaultCurrencyCode, days, ...geo },
        };
    }
}

function weekStart(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(d.getTime() - day * DAY).toISOString().slice(0, 10);
}

function round1(n: number) {
    return Math.round(n * 10) / 10;
}
