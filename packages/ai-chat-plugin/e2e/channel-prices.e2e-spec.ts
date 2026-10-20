process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { RequestContextService, TransactionalConnection, User } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { createAiTestEnvironment, serverInitOptions } from './utils/test-environment';

describe('admin product tools are channel-aware', () => {
    const { server, adminClient } = createAiTestEnvironment();
    let tools: any;

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        const { zones } = await adminClient.query(gql`{ zones { items { id } } }`);
        const { createChannel } = await adminClient.query(gql`
            mutation($zone: ID!) {
                createChannel(input: {
                    code: "uk", token: "uk-token", defaultLanguageCode: en, currencyCode: GBP, pricesIncludeTax: true,
                    defaultTaxZoneId: $zone, defaultShippingZoneId: $zone
                }) { ... on Channel { id } }
            }`, { zone: zones.items[0].id });
        // Only the laptop (T_1) is sold in the UK channel, at twice the price.
        await adminClient.query(gql`
            mutation($channelId: ID!) { assignProductsToChannel(input: { productIds: ["T_1"], channelId: $channelId, priceFactor: 2 }) { id } }`,
            { channelId: createChannel.id });
        const user = await server.app.get(TransactionalConnection).rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: 'superadmin' },
            relations: ['roles', 'roles.channels'],
        });
        const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: 'uk-token' });
        tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 });
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('lists only the channel’s products, priced in its currency', async () => {
        const result = await tools.searchProducts.execute({}, { toolCallId: 't', messages: [] });
        expect(result.products).toHaveLength(1);
        expect(result.products[0]).toMatchObject({ name: 'Laptop', currencyCode: 'GBP' });
        // default channel's net price × priceFactor, stored including 20% tax (pricesIncludeTax)
        expect(result.products[0].price).toBe(129900 * 2 * 1.2);
        expect(result.summary).toMatch(/price £3,117\.60 incl\. tax/);
    });

    it('product details use the channel price too', async () => {
        const result = await tools.getProductDetails.execute({ slug: 'laptop' }, { toolCallId: 't', messages: [] });
        expect(result.summary).toMatch(/£3,117\.60/);
        expect(result.summary).not.toMatch(/\$1,299/);
    });
});
