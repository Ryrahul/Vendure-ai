/**
 * Structured "insight cards" the admin assistant attaches to its replies. The dashboard
 * renders them under the message (charts, tables, source lists). Amounts are in the
 * smallest currency unit.
 */
import type { CustomerGeography, SalesSummary, TopProduct } from './sales-analytics.service';

export interface InventoryPlanItem {
    variantId: string;
    name: string;
    sku: string;
    /** Saleable stock, or null when the variant's stock is not tracked. */
    available: number | null;
    dailyDemand: number;
    /** Units expected to sell over the planning horizon. */
    forecastDemand: number;
    daysOfCover: number | null;
    stockoutDate: string | null;
    suggestedOrderQty: number;
    status: 'reorder-now' | 'reorder-soon' | 'ok' | 'overstock' | 'not-tracked';
}

export type InsightCard =
    | ({ type: 'salesSummary' } & SalesSummary)
    | {
          type: 'salesTrend';
          currencyCode: string;
          granularity: 'day' | 'week' | 'month';
          points: Array<{ label: string; revenue: number; orders: number }>;
      }
    | {
          type: 'forecast';
          currencyCode: string;
          horizonDays: number;
          method: string;
          /** totalError: error of the period total; wape: error of individual days. */
          backtest: { days: number; wape: number | null; totalError: number | null };
          history: Array<{ date: string; revenue: number }>;
          forecast: Array<{ date: string; revenue: number; lower: number; upper: number }>;
          totals: { forecastRevenue: number; lower: number; upper: number; forecastOrders: number; previousPeriodRevenue: number };
      }
    | { type: 'inventoryPlan'; horizonDays: number; leadTimeDays: number; items: InventoryPlanItem[] }
    | { type: 'topProducts'; currencyCode: string; days: number; sortBy: 'revenue' | 'units'; items: TopProduct[] }
    | ({ type: 'customerLocations'; currencyCode: string; days: number } & CustomerGeography)
    | { type: 'webSources'; sources: Array<{ title: string; url: string }> };
