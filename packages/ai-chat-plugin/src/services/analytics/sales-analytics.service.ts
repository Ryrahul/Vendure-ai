import { Injectable } from '@nestjs/common';
import { OrderLine, ProductVariant, ProductVariantService, RequestContext, TransactionalConnection } from '@vendure/core';
import { In, IsNull } from 'typeorm';

export interface DailySales {
    /** UTC day, YYYY-MM-DD */
    date: string;
    /** Product sales incl. tax, after discounts, excl. shipping (smallest currency unit). */
    revenue: number;
    orders: number;
}

export interface SalesSummary {
    currencyCode: string;
    days: number;
    revenue: number;
    orders: number;
    averageOrderValue: number;
    customers: number;
    unitsSold: number;
    previous: { revenue: number; orders: number; averageOrderValue: number; unitsSold: number };
}

export interface TopProduct {
    productId: string;
    name: string;
    unitsSold: number;
    revenue: number;
}

export interface LocationSales {
    location: string;
    orders: number;
    revenue: number;
}

export interface CustomerGeography {
    countries: LocationSales[];
    regions: LocationSales[];
    cities: LocationSales[];
    ordersWithAddress: number;
}

export interface VariantDemand {
    variantId: string;
    productId: string;
    name: string;
    sku: string;
    /** Units sold per day over the history window (oldest first). */
    dailyUnits: number[];
}

const MAX_LINES = 50_000;

/**
 * Sales data for the admin assistant, always scoped to the active channel and to placed,
 * non-cancelled orders. In multi-vendor setups seller sub-orders are excluded so sales
 * are not counted twice. Days are UTC.
 */
@Injectable()
export class SalesAnalyticsService {
    constructor(
        private connection: TransactionalConnection,
        private productVariantService: ProductVariantService,
    ) {}

    /** One entry per UTC day for the `days` days before today (today is excluded: it is incomplete). */
    async dailySales(ctx: RequestContext, days: number): Promise<DailySales[]> {
        const { from, to } = completeDays(days);
        const rows: Array<{ day: string; revenue: string; orders: string }> = await this.query(
            ctx,
            `SELECT to_char(date_trunc('day', o."orderPlacedAt"), 'YYYY-MM-DD') AS day,
                    COALESCE(SUM(o."subTotalWithTax"), 0) AS revenue, COUNT(*) AS orders
             FROM "order" o
             ${this.placedOrdersInChannel('o')}
               AND o."orderPlacedAt" >= $2 AND o."orderPlacedAt" < $3
             GROUP BY 1`,
            [from, to],
        );
        const byDay = new Map(rows.map(r => [r.day, r]));
        return dayRange(from, days).map(date => ({
            date,
            revenue: Number(byDay.get(date)?.revenue ?? 0),
            orders: Number(byDay.get(date)?.orders ?? 0),
        }));
    }

    /** Totals for the last `days` days (including today) vs the `days` before. */
    async summary(ctx: RequestContext, days: number): Promise<SalesSummary> {
        const now = new Date();
        const start = new Date(now.getTime() - days * DAY);
        const prevStart = new Date(start.getTime() - days * DAY);
        const [current, previous] = await Promise.all([this.totals(ctx, start, now), this.totals(ctx, prevStart, start)]);
        return {
            currencyCode: ctx.channel.defaultCurrencyCode,
            days,
            ...current,
            previous: {
                revenue: previous.revenue,
                orders: previous.orders,
                averageOrderValue: previous.averageOrderValue,
                unitsSold: previous.unitsSold,
            },
        };
    }

    async topProducts(ctx: RequestContext, days: number, limit: number, sortBy: 'revenue' | 'units'): Promise<{ items: TopProduct[]; truncated: boolean }> {
        const lines = await this.connection
            .getRepository(ctx, OrderLine)
            .createQueryBuilder('line')
            .innerJoin('line.order', 'o')
            .innerJoin('o.channels', 'ch', 'ch.id = :channelId', { channelId: ctx.channelId })
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('product.translations', 'pt')
            .where('o.orderPlacedAt >= :from', { from: new Date(Date.now() - days * DAY) })
            .andWhere("o.state != 'Cancelled'")
            .andWhere("o.type != 'Seller'")
            .andWhere('line.quantity > 0')
            .take(MAX_LINES)
            .getMany();
        const byProduct = new Map<string, TopProduct>();
        for (const line of lines) {
            const product = line.productVariant?.product;
            if (!product) continue;
            const key = String(product.id);
            const entry = byProduct.get(key) ?? { productId: key, name: translatedName(product.translations, ctx), unitsSold: 0, revenue: 0 };
            entry.unitsSold += line.quantity;
            entry.revenue += line.proratedLinePriceWithTax;
            byProduct.set(key, entry);
        }
        const items = [...byProduct.values()]
            .sort((a, b) => (sortBy === 'units' ? b.unitsSold - a.unitsSold : b.revenue - a.revenue))
            .slice(0, limit)
            .map(p => ({ ...p, revenue: Math.round(p.revenue) }));
        return { items, truncated: lines.length >= MAX_LINES };
    }

    /** Where orders ship to, from order shipping addresses. */
    async customerGeography(ctx: RequestContext, days: number, limit = 10): Promise<CustomerGeography> {
        const rows: Array<{ address: string | null; revenue: string }> = await this.query(
            ctx,
            `SELECT o."shippingAddress" AS address, o."subTotalWithTax" AS revenue
             FROM "order" o
             ${this.placedOrdersInChannel('o')}
               AND o."orderPlacedAt" >= $2`,
            [new Date(Date.now() - days * DAY)],
        );
        const countries = new Map<string, LocationSales>();
        const regions = new Map<string, LocationSales>();
        const cities = new Map<string, LocationSales>();
        let ordersWithAddress = 0;
        for (const row of rows) {
            const a = parseAddress(row.address);
            if (!a.country && !a.city) continue;
            ordersWithAddress++;
            const revenue = Number(row.revenue ?? 0);
            add(countries, a.country, revenue);
            add(regions, [a.province, a.country].filter(Boolean).join(', '), revenue);
            add(cities, [a.city, a.province || a.country].filter(Boolean).join(', '), revenue);
        }
        const top = (m: Map<string, LocationSales>) => [...m.values()].sort((x, y) => y.orders - x.orders).slice(0, limit);
        return { countries: top(countries), regions: top(regions), cities: top(cities), ordersWithAddress };
    }

    /** Units sold per variant per day (complete UTC days) for variants with any sales. */
    async variantDemand(ctx: RequestContext, days: number): Promise<VariantDemand[]> {
        const { from, to } = completeDays(days);
        const rows: Array<{ day: string; variantId: number; units: string }> = await this.query(
            ctx,
            `SELECT to_char(date_trunc('day', o."orderPlacedAt"), 'YYYY-MM-DD') AS day,
                    l."productVariantId" AS "variantId", SUM(l.quantity) AS units
             FROM order_line l
             JOIN "order" o ON o.id = l."orderId"
             ${this.placedOrdersInChannel('o')}
               AND o."orderPlacedAt" >= $2 AND o."orderPlacedAt" < $3
             GROUP BY 1, 2`,
            [from, to],
        );
        if (!rows.length) return [];
        const dates = dayRange(from, days);
        const index = new Map(dates.map((d, i) => [d, i]));
        const series = new Map<number, number[]>();
        for (const r of rows) {
            const s = series.get(r.variantId) ?? Array(days).fill(0);
            const i = index.get(r.day);
            if (i !== undefined) s[i] += Number(r.units);
            series.set(r.variantId, s);
        }
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In([...series.keys()]), deletedAt: IsNull() },
            relations: ['translations', 'product'],
        });
        return variants.map(v => ({
            variantId: String(v.id),
            productId: String(v.productId),
            name: translatedName(v.translations, ctx),
            sku: v.sku,
            dailyUnits: series.get(Number(v.id)) ?? [],
        }));
    }

    /** Saleable stock for a variant, or null when stock is not tracked. */
    async saleableStock(ctx: RequestContext, variantId: string): Promise<number | null> {
        const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({ where: { id: variantId } });
        if (!variant) return null;
        const level = await this.productVariantService.getSaleableStockLevel(ctx, variant);
        return level >= Number.MAX_SAFE_INTEGER / 2 ? null : level;
    }

    private async totals(ctx: RequestContext, from: Date, to: Date) {
        const [row]: Array<{ revenue: string; orders: string; customers: string }> = await this.query(
            ctx,
            `SELECT COALESCE(SUM(o."subTotalWithTax"), 0) AS revenue, COUNT(*) AS orders, COUNT(DISTINCT o."customerId") AS customers
             FROM "order" o
             ${this.placedOrdersInChannel('o')}
               AND o."orderPlacedAt" >= $2 AND o."orderPlacedAt" < $3`,
            [from, to],
        );
        const [units]: Array<{ units: string }> = await this.query(
            ctx,
            `SELECT COALESCE(SUM(l.quantity), 0) AS units
             FROM order_line l JOIN "order" o ON o.id = l."orderId"
             ${this.placedOrdersInChannel('o')}
               AND o."orderPlacedAt" >= $2 AND o."orderPlacedAt" < $3`,
            [from, to],
        );
        const revenue = Number(row?.revenue ?? 0);
        const orders = Number(row?.orders ?? 0);
        return {
            revenue,
            orders,
            averageOrderValue: orders ? Math.round(revenue / orders) : 0,
            customers: Number(row?.customers ?? 0),
            unitsSold: Number(units?.units ?? 0),
        };
    }

    /** WHERE clause for placed, non-cancelled, non-seller orders in the channel ($1). */
    private placedOrdersInChannel(alias: string) {
        return `JOIN order_channels_channel occ ON occ."orderId" = ${alias}.id AND occ."channelId" = $1
             WHERE ${alias}."orderPlacedAt" IS NOT NULL
               AND ${alias}.state != 'Cancelled'
               AND ${alias}.type != 'Seller'`;
    }

    private query<T = any>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T[]> {
        return this.connection.getRepository(ctx, OrderLine).manager.query(sql, [ctx.channelId, ...params]);
    }
}

export const DAY = 24 * 60 * 60 * 1000;

function completeDays(days: number) {
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to.getTime() - days * DAY);
    return { from, to };
}

function dayRange(from: Date, days: number): string[] {
    return Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY).toISOString().slice(0, 10));
}

function translatedName(translations: Array<{ languageCode: string; name?: string }> | undefined, ctx: RequestContext): string {
    const t = translations?.find(x => x.languageCode === ctx.languageCode) ?? translations?.[0];
    return t?.name ?? '';
}

function parseAddress(raw: string | null): { country?: string; province?: string; city?: string } {
    if (!raw) return {};
    try {
        const a = JSON.parse(raw);
        return {
            country: a.country || a.countryCode || undefined,
            province: a.province || undefined,
            city: a.city ? String(a.city).trim() : undefined,
        };
    } catch {
        return {};
    }
}

function add(map: Map<string, LocationSales>, key: string | undefined, revenue: number) {
    if (!key) return;
    const entry = map.get(key) ?? { location: key, orders: 0, revenue: 0 };
    entry.orders++;
    entry.revenue += revenue;
    map.set(key, entry);
}
