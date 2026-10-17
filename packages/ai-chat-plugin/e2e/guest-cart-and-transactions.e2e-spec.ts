process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import {
    DefaultSearchPlugin,
    ProductService,
    RequestContext,
    RequestContextService,
    SessionService,
    TransactionalConnection,
    User,
} from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { AiChatService } from '../src/services/ai-chat.service';
import { runToolInTransaction } from '../src/services/tool-transactions';
import { createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, PORT, serverInitOptions } from './utils/test-environment';

describe('guest carts and write transactions', () => {
    const { server, adminClient } = createAiTestEnvironment({}, [DefaultSearchPlugin.init({ bufferUpdates: false })]);

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
    });

    afterAll(async () => {
        await server.destroy();
    });

    /** A shop RequestContext for the session behind a storefront auth token, as the chat endpoint builds it. */
    async function shopCtxForToken(token: string): Promise<RequestContext> {
        const session = await server.app.get(SessionService).getSessionFromToken(token);
        const req: any = {
            headers: { 'vendure-token': DEFAULT_CHANNEL_TOKEN, authorization: `Bearer ${token}` },
            query: {},
            get(name: string) {
                return this.headers[name.toLowerCase()];
            },
        };
        return server.app.get(RequestContextService).fromRequest(req, undefined, undefined, session);
    }

    async function shop(query: string, token?: string) {
        const res = await fetch(`http://localhost:${PORT}/shop-api`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'vendure-token': DEFAULT_CHANNEL_TOKEN,
                ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ query }),
        });
        return { token: res.headers.get('vendure-auth-token') ?? token, body: await res.json() };
    }

    describe('guest cart', () => {
        let guestToken: string;
        let tools: any;

        beforeAll(async () => {
            // A guest adds an item through the storefront, which creates their anonymous session + cart.
            const added = await shop('mutation { addItemToOrder(productVariantId: "T_3", quantity: 2) { __typename } }');
            guestToken = added.token as string;
            expect(added.body.data.addItemToOrder.__typename).toBe('Order');
            const ctx = await shopCtxForToken(guestToken);
            expect(ctx.activeUserId).toBeUndefined(); // really a guest
            tools = (server.app.get(AiChatService) as any).buildTools(ctx);
        });

        it('a guest can see their cart', async () => {
            const result = await tools.getActiveOrder.execute({}, { toolCallId: 't', messages: [] });
            expect(result.activeOrder?.totalQuantity).toBe(2);
            expect(result.summary).toMatch(/Cart has 2 item/);
        });

        it('a guest can change a quantity', async () => {
            const cart = await tools.getActiveOrder.execute({}, { toolCallId: 't', messages: [] });
            const lineId = cart.activeOrder.lines[0].orderLineId;
            const result = await tools.adjustOrderLine.execute({ orderLineId: lineId, quantity: 3 }, { toolCallId: 't', messages: [] });
            expect(result.activeOrder.totalQuantity).toBe(3);
            const { body } = await shop('{ activeOrder { totalQuantity } }', guestToken);
            expect(body.data.activeOrder.totalQuantity).toBe(3); // same cart the storefront sees
        });

        it('a guest can see shipping options for their cart', async () => {
            const result = await tools.getEligibleShippingMethods.execute({}, { toolCallId: 't', messages: [] });
            expect(result.summary).toMatch(/Standard Shipping/);
        });

        it('a shopper without any session gets a clear message, not an error', async () => {
            const ctx = await server.app.get(RequestContextService).create({ apiType: 'shop', channelOrToken: DEFAULT_CHANNEL_TOKEN });
            const anonTools = (server.app.get(AiChatService) as any).buildTools(ctx);
            const result = await anonTools.getActiveOrder.execute({}, { toolCallId: 't', messages: [] });
            expect(result.summary).toMatch(/No cart found/);
        });
    });

    describe('write transactions', () => {
        async function superadminCtx(): Promise<RequestContext> {
            const user = await server.app
                .get(TransactionalConnection)
                .rawConnection.getRepository(User)
                .findOneOrFail({ where: { identifier: 'superadmin' }, relations: ['roles', 'roles.channels'] });
            return server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN });
        }

        async function productNamed(name: string) {
            const { products } = await adminClient.query(
                gql`query($name: String!) { products(options: { filter: { name: { eq: $name } } }) { totalItems } }`,
                { name },
            );
            return products.totalItems as number;
        }

        it('a write that reports failure is rolled back', async () => {
            const ctx = await superadminCtx();
            const output = await runToolInTransaction(server.app.get(TransactionalConnection), ctx, async txCtx => {
                await server.app.get(ProductService).create(txCtx, {
                    translations: [{ languageCode: 'en' as any, name: 'Rolled Back Product', slug: 'rolled-back', description: '' }],
                });
                return { summary: 'Error: something failed after creating the product' };
            });
            expect((output as any).summary).toMatch(/^Error/);
            expect(await productNamed('Rolled Back Product')).toBe(0);
        });

        it('createProductWithVariants failing half-way leaves no half-created product', async () => {
            const ctx = await superadminCtx();
            const tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 }) as any;
            const result = await tools.createProductWithVariants.execute(
                {
                    name: 'Half Made Shirt',
                    optionGroups: [{ name: 'Size', values: ['S'] }],
                    // 'XL' is not a value of the Size group, so variant creation fails after the product exists.
                    variants: [{ name: 'Shirt XL', sku: 'SHIRT-XL', price: 1000, optionValues: ['XL'] }],
                },
                { toolCallId: 't', messages: [] },
            );
            expect(result.summary).toMatch(/^(Error|Could not)/);
            expect(await productNamed('Half Made Shirt')).toBe(0);
        });

        it('control: without the transaction, that same failure leaves a half-created product', async () => {
            const ctx = await superadminCtx();
            const rawTools = (server.app.get(AdminAiChatService) as any).buildTools(ctx);
            const result = await rawTools.createProductWithVariants.execute(
                {
                    name: 'Half Made Shirt (no tx)',
                    optionGroups: [{ name: 'Size', values: ['S'] }],
                    variants: [{ name: 'Shirt XL', sku: 'SHIRT-XL-2', price: 1000, optionValues: ['XL'] }],
                },
                { toolCallId: 't', messages: [] },
            );
            expect(result.summary).toMatch(/^(Error|Could not)/);
            expect(await productNamed('Half Made Shirt (no tx)')).toBe(1);
        });

        it('a successful write is committed', async () => {
            const ctx = await superadminCtx();
            const tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 }) as any;
            const result = await tools.createProductWithVariants.execute(
                {
                    name: 'Whole Shirt',
                    optionGroups: [{ name: 'Size', values: ['M'] }],
                    variants: [{ name: 'Shirt M', sku: 'SHIRT-M', price: 1000, optionValues: ['M'] }],
                },
                { toolCallId: 't', messages: [] },
            );
            expect(result.summary).not.toMatch(/^Error/);
            expect(await productNamed('Whole Shirt')).toBe(1);
        });
    });
});
