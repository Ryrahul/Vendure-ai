// ─── Types (mirror backend response) ────────────────────────────────

export interface Product {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

export interface Collection {
    id: string;
    name: string;
    slug: string;
}

export interface OrderLine {
    productName: string;
    quantity: number;
    image: string | null;
    linePriceWithTax: number;
}

export interface Order {
    id: string;
    code: string;
    state: string;
    total: number;
    orderPlacedAt: string | null;
    lines: OrderLine[];
    fulfillments: Array<{
        state: string;
        method: string;
        trackingCode: string | null;
    }>;
}

/** A destructive action the assistant requested; it only runs when the admin presses Confirm. */
export interface PendingConfirmation {
    id: string;
    toolName: string;
    description: string;
    status?: 'pending' | 'working' | 'confirmed' | 'cancelled' | 'failed';
    /** Outcome reported by the server after Confirm / Cancel. */
    result?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: Product[];
    collections?: Collection[];
    orders?: Order[];
    pendingConfirmations?: PendingConfirmation[];
    /** Charts and tables from the business-insight tools (sales, forecast, inventory, web sources). */
    insights?: InsightCard[];
}

// ─── Insight cards (amounts in the smallest currency unit) ───────────

export interface LocationSales {
    location: string;
    orders: number;
    revenue: number;
}

export interface InventoryPlanItem {
    variantId: string;
    name: string;
    sku: string;
    available: number | null;
    dailyDemand: number;
    forecastDemand: number;
    daysOfCover: number | null;
    stockoutDate: string | null;
    suggestedOrderQty: number;
    status: 'reorder-now' | 'reorder-soon' | 'ok' | 'overstock' | 'not-tracked';
}

export type InsightCard =
    | {
          type: 'salesSummary';
          currencyCode: string;
          days: number;
          revenue: number;
          orders: number;
          averageOrderValue: number;
          customers: number;
          unitsSold: number;
          previous: { revenue: number; orders: number; averageOrderValue: number; unitsSold: number };
      }
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
          backtest: { days: number; wape: number | null; totalError?: number | null };
          history: Array<{ date: string; revenue: number }>;
          forecast: Array<{ date: string; revenue: number; lower: number; upper: number }>;
          totals: { forecastRevenue: number; lower: number; upper: number; forecastOrders: number; previousPeriodRevenue: number };
      }
    | { type: 'inventoryPlan'; horizonDays: number; leadTimeDays: number; items: InventoryPlanItem[] }
    | {
          type: 'topProducts';
          currencyCode: string;
          days: number;
          sortBy: 'revenue' | 'units';
          items: Array<{ productId: string; name: string; unitsSold: number; revenue: number }>;
      }
    | {
          type: 'customerLocations';
          currencyCode: string;
          days: number;
          countries: LocationSales[];
          regions: LocationSales[];
          cities: LocationSales[];
          ordersWithAddress: number;
      }
    | { type: 'webSources'; sources: Array<{ title: string; url: string }> };
