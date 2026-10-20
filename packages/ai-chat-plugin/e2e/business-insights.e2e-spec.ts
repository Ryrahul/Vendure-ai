process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { RequestContext, RequestContextService, TransactionalConnection, User } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { BusinessInsightsService } from '../src/services/analytics/business-insights.service';
import { SalesAnalyticsService } from '../src/services/analytics/sales-analytics.service';
import { StoreProfileService } from '../src/services/analytics/store-profile.service';
import { createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, PORT, serverInitOptions } from './utils/test-environment';

const DAY = 24 * 60 * 60 * 1000;
const CITIES = [
    { city: 'Kathmandu', province: 'Bagmati', country: 'Nepal', countryCode: 'NP' },
    { city: 'Kathmandu', province: 'Bagmati', country: 'Nepal', countryCode: 'NP' },
    { city: 'Pokhara', province: 'Gandaki', country: 'Nepal', countryCode: 'NP' },
];

describe('business insights', () => {
    const searches: Array<{ query: string; location: any }> = [];
    const { server, adminClient } = createAiTestEnvironment({
        // A custom search provider, as a store not on OpenAI would plug in (Tavily, Brave, …).
        webSearch: async (query, location) => {
            searches.push({ query, location });
            return {
                summary: 'Example Electronics, Kathmandu: Camera NPR 23,500.',
                sources: [{ title: 'Example Electronics — Camera', url: 'https://shop.example.com/camera' }],
            };
        },
    });
    let ctx: RequestContext;
    let insights: BusinessInsightsService;
    let expected: { orders: number; revenue: number };

    /** Creates a cart through the Shop API and turns it into a placed order on the given day. */
    async function placeOrder(daysAgo: number, variantId: string, quantity: number, i: number) {
        const res = await fetch(`http://localhost:${PORT}/shop-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'vendure-token': DEFAULT_CHANNEL_TOKEN },
            body: JSON.stringify({ query: `mutation { addItemToOrder(productVariantId: "${variantId}", quantity: ${quantity}) { ... on Order { code } } }` }),
        });
        const { data } = await res.json();
        const placedAt = new Date(Date.now() - daysAgo * DAY);
        placedAt.setUTCHours(12, 0, 0, 0);
        await server.app
            .get(TransactionalConnection)
            .rawConnection.query(
                `UPDATE "order" SET state = 'PaymentSettled', active = false, "orderPlacedAt" = $1, "shippingAddress" = $2 WHERE code = $3`,
                [placedAt, JSON.stringify(CITIES[i % CITIES.length]), data.addItemToOrder.code],
            );
    }

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        // Stock: tracked for the laptop (T_1, plenty) and camera (T_3, nearly out).
        await adminClient.query(gql`
            mutation {
                updateProductVariants(input: [
                    { id: "T_1", trackInventory: TRUE, stockOnHand: 500 }
                    { id: "T_3", trackInventory: TRUE, stockOnHand: 3 }
                ]) { id }
            }
        `);
        // 60 days of history: a camera every day (two at weekends), a laptop every third day.
        let n = 0;
        for (let daysAgo = 60; daysAgo >= 1; daysAgo--) {
            const weekend = [0, 6].includes(new Date(Date.now() - daysAgo * DAY).getUTCDay());
            await placeOrder(daysAgo, 'T_3', weekend ? 2 : 1, n++);
            if (daysAgo % 3 === 0) await placeOrder(daysAgo, 'T_1', 1, n++);
        }
        // An abandoned cart and a cancelled order must not count.
        await fetch(`http://localhost:${PORT}/shop-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'vendure-token': DEFAULT_CHANNEL_TOKEN },
            body: JSON.stringify({ query: 'mutation { addItemToOrder(productVariantId: "T_1", quantity: 1) { __typename } }' }),
        });
        const conn = server.app.get(TransactionalConnection).rawConnection;
        await conn.query(`UPDATE "order" SET state = 'Cancelled' WHERE id = (SELECT min(id) FROM "order" WHERE "orderPlacedAt" IS NOT NULL)`);
        const [row] = await conn.query(
            `SELECT COUNT(*) AS orders, SUM("subTotalWithTax") AS revenue FROM "order" WHERE "orderPlacedAt" >= now() - interval '30 days' AND state = 'PaymentSettled'`,
        );
        expected = { orders: Number(row.orders), revenue: Number(row.revenue) };

        const user = await conn.getRepository(User).findOneOrFail({ where: { identifier: 'superadmin' }, relations: ['roles', 'roles.channels'] });
        ctx = await server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN });
        insights = server.app.get(BusinessInsightsService);
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('summary matches the placed orders exactly (excludes carts and cancelled orders)', async () => {
        const { insight } = await insights.salesSummary(ctx, 30);
        expect(insight).toMatchObject({ type: 'salesSummary', orders: expected.orders, revenue: expected.revenue });
        expect((insight as any).previous.orders).toBeGreaterThan(0);
    });

    it('daily series is zero-filled and covers complete days only', async () => {
        const daily = await server.app.get(SalesAnalyticsService).dailySales(ctx, 90);
        expect(daily).toHaveLength(90);
        expect(daily[0].revenue).toBe(0); // before the history starts
        expect(daily[daily.length - 1].date).toBe(new Date(Date.now() - DAY).toISOString().slice(0, 10));
    });

    it('top products rank by units', async () => {
        const { insight } = await insights.topProducts(ctx, 60, 5, 'units');
        const items = (insight as any).items;
        expect(items[0].name).toBe('Camera');
        expect(items[1].name).toBe('Laptop');
        expect(items[0].unitsSold).toBeGreaterThan(items[1].unitsSold);
    });

    it('customer locations come from shipping addresses', async () => {
        const { insight, summary } = await insights.customerLocations(ctx, 90);
        expect((insight as any).cities[0].location).toBe('Kathmandu, Bagmati');
        expect((insight as any).countries[0].location).toBe('Nepal');
        expect(summary).toMatch(/Pokhara/);
    });

    it('forecasts the next 30 days with a range and a measured accuracy', async () => {
        const { insight, summary } = await insights.forecastSales(ctx, 30, 180);
        const f = insight as any;
        expect(f.type).toBe('forecast');
        expect(f.method).toBe('holt-winters-weekly');
        expect(f.forecast).toHaveLength(30);
        expect(f.totals.lower).toBeLessThanOrEqual(f.totals.forecastRevenue);
        expect(f.totals.upper).toBeGreaterThanOrEqual(f.totals.forecastRevenue);
        // A steady business: the next 30 days should resemble the last 30.
        expect(f.totals.forecastRevenue / f.totals.previousPeriodRevenue).toBeGreaterThan(0.7);
        expect(f.totals.forecastRevenue / f.totals.previousPeriodRevenue).toBeLessThan(1.3);
        // The period range is usable, not "anything from zero to five times as much".
        expect(f.totals.upper / Math.max(1, f.totals.lower)).toBeLessThan(3);
        // Orders agree with revenue (~1 camera order a day, a laptop every third day).
        expect(f.totals.forecastOrders).toBeGreaterThan(30);
        expect(f.totals.forecastOrders).toBeLessThan(60);
        expect(f.backtest.totalError).not.toBeNull();
        expect(summary).toMatch(/forecast total was off by about \d+%/);
    });

    it('inventory plan flags the nearly-sold-out camera and leaves the laptop alone', async () => {
        await server.app.get(StoreProfileService).update(ctx, { supplierLeadTimeDays: 10 });
        const { insight } = await insights.inventoryPlan(ctx, 30);
        const plan = insight as any;
        expect(plan.leadTimeDays).toBe(10);
        const camera = plan.items.find((i: any) => i.name === 'Camera');
        const laptop = plan.items.find((i: any) => i.name.startsWith('Laptop'));
        expect(camera.status).toBe('reorder-now');
        expect(camera.suggestedOrderQty).toBeGreaterThan(40); // ~1.3/day over 10 + 30 days
        expect(['ok', 'overstock']).toContain(laptop.status);
        expect(plan.items[0].name).toBe('Camera'); // most urgent first
    });

    it('a forecast with too little history says so instead of guessing', async () => {
        const user = await server.app.get(TransactionalConnection).rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: 'superadmin' },
            relations: ['roles', 'roles.channels'],
        });
        const emptyChannelCtx = await server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN });
        (emptyChannelCtx as any)._channel = { ...emptyChannelCtx.channel, id: 999999 };
        const result = await insights.forecastSales(emptyChannelCtx, 30, 180);
        expect(result.insight).toBeUndefined();
        expect(result.summary).toMatch(/Not enough sales history/);
    });

    it('the store profile is saved per channel and reports what is missing', async () => {
        const profiles = server.app.get(StoreProfileService);
        await profiles.update(ctx, { city: 'Kathmandu', countryCode: 'np', competitors: ['example.com'] });
        const profile = await profiles.get(ctx);
        expect(profile).toMatchObject({ city: 'Kathmandu', countryCode: 'NP', supplierLeadTimeDays: 10, competitors: ['example.com'] });
        expect(profiles.missingFields(profile)).toEqual([
            'regions/cities you sell or deliver to',
            'what the store sells and who its customers are',
        ]);
    });

    it('insight tools only send their summary to the model', async () => {
        const tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 }) as any;
        const output = await tools.forecastSales.execute({}, { toolCallId: 't', messages: [] });
        const modelSees = tools.forecastSales.toModelOutput({ toolCallId: 't', input: {}, output });
        expect(modelSees).toEqual({ type: 'text', value: output.summary });
        expect(JSON.stringify(modelSees)).not.toMatch(/"forecast":\[/);
    });

    it('web research uses the configured search provider, localized to the store, with sources', async () => {
        const tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 }) as any;
        const output = await tools.searchWeb.execute({ query: 'camera price Kathmandu' }, { toolCallId: 't', messages: [] });
        expect(searches[0]).toEqual({ query: 'camera price Kathmandu', location: { city: 'Kathmandu', region: undefined, countryCode: 'NP' } });
        expect(output.sources).toEqual([{ title: 'Example Electronics — Camera', url: 'https://shop.example.com/camera' }]);
        const modelSees = tools.searchWeb.toModelOutput({ toolCallId: 't', input: {}, output }).value;
        expect(modelSees).toMatch(/untrusted web content/);
        expect(modelSees).toMatch(/NPR 23,500/);
        expect(modelSees).toMatch(/https:\/\/shop\.example\.com\/camera/);
    });
});
