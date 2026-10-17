/**
 * Shop search goes through the Shop API, so it follows the configured search engine and
 * every storefront visibility rule (channel, enabled, deleted, currency, tax).
 */
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1'; // never reach OpenAI from tests

import { CurrencyCode, DefaultSearchPlugin, LanguageCode, RequestContext, RequestContextService } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '../src/constants';
import { AiChatService } from '../src/services/ai-chat.service';
import { EmbeddingService } from '../src/services/embedding.service';
import { ProductEmbeddingService } from '../src/services/product-embedding.service';
import { StorefrontApiService } from '../src/services/storefront-api.service';
import { awaitRunningJobs, createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, serverInitOptions } from './utils/test-environment';

const CHANNEL_B_TOKEN = 'channel-b-token';

describe('storefront search (DefaultSearchPlugin)', () => {
    const { server, adminClient } = createAiTestEnvironment({}, [
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    ]);
    let storefront: StorefrontApiService;
    let ctxA: RequestContext;
    let ctxB: RequestContext;

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        const { zones } = await adminClient.query(gql`{ zones { items { id } } }`);
        const { createChannel } = await adminClient.query(
            gql`mutation($input: CreateChannelInput!) { createChannel(input: $input) { ... on Channel { id } } }`,
            {
                input: {
                    code: 'channel-b',
                    token: CHANNEL_B_TOKEN,
                    defaultLanguageCode: LanguageCode.en,
                    pricesIncludeTax: false,
                    defaultCurrencyCode: CurrencyCode.GBP,
                    defaultShippingZoneId: zones.items[0].id,
                    defaultTaxZoneId: zones.items[0].id,
                },
            },
        );
        // Channel B gets everything except Headphones.
        await adminClient.query(
            gql`mutation($input: AssignProductsToChannelInput!) { assignProductsToChannel(input: $input) { id } }`,
            { input: { productIds: ['T_1', 'T_2', 'T_3', 'T_4'], channelId: createChannel.id, priceFactor: 1 } },
        );
        // Tablet is disabled everywhere.
        await adminClient.query(gql`mutation { updateProduct(input: { id: "T_4", enabled: false }) { id } }`);
        await awaitRunningJobs(adminClient);

        storefront = server.app.get(StorefrontApiService);
        const rcs = server.app.get(RequestContextService);
        ctxA = await rcs.create({ apiType: 'shop', channelOrToken: DEFAULT_CHANNEL_TOKEN });
        ctxB = await rcs.create({ apiType: 'shop', channelOrToken: CHANNEL_B_TOKEN });
    });

    afterAll(async () => {
        await server.destroy();
    });

    const names = (items: Array<{ productName: string }>) => items.map(i => i.productName).sort();

    it('finds products through the configured engine', async () => {
        const { items } = await storefront.search(ctxA, { term: 'laptop', take: 10 });
        expect(names(items)).toEqual(['Laptop']);
        expect(items[0].variantId).toMatch(/\d+/);
        expect(items[0].currencyCode).toBe('USD');
    });

    it('never returns disabled products', async () => {
        const { items } = await storefront.search(ctxA, { term: 'tablet', take: 10 });
        expect(items).toEqual([]);
    });

    it('is scoped to the shopper channel and its currency', async () => {
        expect((await storefront.search(ctxB, { term: 'headphones', take: 10 })).items).toEqual([]);
        const { items } = await storefront.search(ctxB, { term: 'camera', take: 10 });
        expect(names(items)).toEqual(['Camera']);
        expect(items[0].currencyCode).toBe('GBP');
    });

    it('reports stock when the engine indexes it', async () => {
        const { items } = await storefront.search(ctxA, { term: 'phone', take: 10 });
        const phone = items.find(i => i.productName === 'Phone');
        expect(phone?.inStock).toBe(false);
    });

    it('filters by the price the customer pays (tax included)', async () => {
        // Camera: 199.00 + 20% tax = 238.80 → above a 200.00 budget; Headphones: 118.80 → within.
        const { items } = await storefront.search(ctxA, { take: 5, maxPriceWithTax: 20000, sortByPrice: 'ASC' });
        expect(names(items)).toEqual(['Headphones']);
    });

    it('loads products by id with storefront visibility, preserving order', async () => {
        const inA = await storefront.getProductsByIds(ctxA, [4, 5, 1, 2]);
        expect(inA.map(p => p.productName)).toEqual(['Headphones', 'Laptop', 'Camera']);
        const inB = await storefront.getProductsByIds(ctxB, [4, 5, 1, 2]);
        expect(inB.map(p => p.productName)).toEqual(['Laptop', 'Camera']);
    });

    it('finds public collections', async () => {
        const collections = await storefront.findCollections(ctxA, 'electr', 10);
        expect(collections.map(c => c.name)).toEqual(['Electronics']);
    });

    describe('assistant tools', () => {
        const searchTools = () => (server.app.get(AiChatService) as any).searchTools;

        it('searchProducts gives the model variantIds and a currency-formatted price', async () => {
            const result = await searchTools().searchProducts(ctxA, { query: 'camera' });
            expect(result.products.map((p: any) => p.name)).toEqual(['Camera']);
            expect(result.summary).toContain('variantId: ');
            expect(result.summary).toContain('$238.80');
        });

        it('filterByPrice uses tax-inclusive prices', async () => {
            const result = await searchTools().filterByPrice(ctxA, { maxPrice: 20000 });
            expect(result.products.map((p: any) => p.name)).toEqual(['Headphones']);
        });

        it('vectorSearch never suggests products hidden from the storefront', async () => {
            const embeddings = server.app.get(ProductEmbeddingService);
            const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));
            // Tablet (disabled) and Headphones (not in channel B) are the closest matches.
            const nearQuery = unit(0).map((v, j) => (j === 1 ? 0.2 : v));
            await embeddings.upsertEmbedding(ctxA, 4, unit(0));
            await embeddings.upsertEmbedding(ctxA, 5, nearQuery);
            await embeddings.upsertEmbedding(ctxA, 2, unit(1));
            const embeddingService = server.app.get(EmbeddingService);
            const original = embeddingService.embed;
            embeddingService.embed = async () => unit(0);
            try {
                const inA = await searchTools().vectorSearch(ctxA, { query: 'something for drawing' });
                expect(inA.products.map((p: any) => p.name)).not.toContain('Tablet');
                expect(inA.products.map((p: any) => p.name)).toContain('Headphones');

                const inB = await searchTools().vectorSearch(ctxB, { query: 'something for drawing' });
                const namesB = inB.products.map((p: any) => p.name);
                expect(namesB).not.toContain('Tablet');
                expect(namesB).not.toContain('Headphones');
            } finally {
                embeddingService.embed = original;
            }
        });
    });
});
