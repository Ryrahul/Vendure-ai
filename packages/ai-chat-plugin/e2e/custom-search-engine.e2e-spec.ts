/**
 * Proves the assistant uses whatever search engine the store configured: no
 * DefaultSearchPlugin here, only a stand-in engine that replaces the Shop API `search`
 * resolver — exactly how Elasticsearch, Typesense or Meilisearch plugins integrate.
 */
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { Args, Query, Resolver } from '@nestjs/graphql';
import { PluginCommonModule, RequestContext, RequestContextService, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AiChatService } from '../src/services/ai-chat.service';
import { createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, serverInitOptions } from './utils/test-environment';

const receivedInputs: any[] = [];

@Resolver()
class FakeEngineResolver {
    @Query()
    search(@Args() args: any) {
        receivedInputs.push(args.input);
        // Like a real engine: raw database ids, which Vendure's id codec encodes on output.
        const all = [
            { productId: 1, productName: 'Laptop (from external engine)', slug: 'laptop', productVariantId: 1, price: 129900 },
            { productId: 2, productName: 'Camera (from external engine)', slug: 'camera', productVariantId: 3, price: 19900 },
        ];
        const range = args.input.priceRangeWithTax;
        const items = all
            .filter(i => !range || (i.price >= range.min && i.price <= range.max))
            .map(i => ({
                ...i,
                sku: 'x',
                productAsset: null,
                productVariantAsset: null,
                productVariantName: i.productName,
                price: { value: i.price },
                priceWithTax: { value: i.price },
                currencyCode: 'USD',
                description: '',
                facetIds: [],
                facetValueIds: [],
                collectionIds: [],
                score: 1,
            }));
        return { items, totalItems: items.length, facetValues: [], collections: [] };
    }
}

@VendurePlugin({
    imports: [PluginCommonModule],
    shopApiExtensions: {
        // Like ElasticsearchPlugin: an engine-specific input field for server-side price filtering.
        schema: gql`
            input PriceRangeInput {
                min: Int!
                max: Int!
            }
            extend input SearchInput {
                priceRangeWithTax: PriceRangeInput
            }
        `,
        resolvers: [FakeEngineResolver],
    },
})
class FakeSearchEnginePlugin {}

describe('custom search engine', () => {
    const { server, adminClient } = createAiTestEnvironment({}, [FakeSearchEnginePlugin]);
    let ctx: RequestContext;

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        ctx = await server.app.get(RequestContextService).create({ apiType: 'shop', channelOrToken: DEFAULT_CHANNEL_TOKEN });
    });

    afterAll(async () => {
        await server.destroy();
    });

    const searchTools = () => (server.app.get(AiChatService) as any).searchTools;

    it('searchProducts returns what the configured engine returns', async () => {
        const result = await searchTools().searchProducts(ctx, { query: 'anything' });
        expect(result.products.map((p: any) => p.name)).toEqual(['Laptop (from external engine)', 'Camera (from external engine)']);
        // Engine ids are decoded to database ids for the cart tools.
        expect(result.products.map((p: any) => p.variantId)).toEqual(['1', '3']);
        expect(receivedInputs.at(-1)).toMatchObject({ term: 'anything', groupByProduct: true });
    });

    it('pushes price filtering down to engines that support it', async () => {
        const result = await searchTools().filterByPrice(ctx, { maxPrice: 50000 });
        expect(result.products.map((p: any) => p.name)).toEqual(['Camera (from external engine)']);
        expect(receivedInputs.at(-1).priceRangeWithTax).toEqual({ min: 0, max: 50000 });
    });
});
