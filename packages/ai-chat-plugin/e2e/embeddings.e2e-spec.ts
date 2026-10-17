process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import gql from 'graphql-tag';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '../src/constants';
import { EmbeddingSyncService } from '../src/services/embedding-sync.service';
import { EmbeddingService } from '../src/services/embedding.service';
import { ProductEmbeddingService } from '../src/services/product-embedding.service';
import { awaitRunningJobs, createAiTestEnvironment, serverInitOptions } from './utils/test-environment';

const settle = () => new Promise(r => setTimeout(r, 2500)); // > debounce

describe('embedding sync', () => {
    const { server, adminClient } = createAiTestEnvironment();
    let calls: string[][];

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        await server.app.get(EmbeddingSyncService).flush(); // let populate-time events finish (they fail: no OpenAI)
        const embeddings = server.app.get(EmbeddingService);
        embeddings.embedMany = async (texts: string[]) => {
            calls.push(texts);
            return texts.map((_, i) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i % EMBEDDING_DIMENSIONS ? 1 : 0)));
        };
    });

    beforeEach(() => {
        calls = [];
    });

    afterAll(async () => {
        await server.destroy();
    });

    const sync = () => server.app.get(EmbeddingSyncService);

    it('embeds the catalog in one batched request', async () => {
        const result = await sync().syncProducts([1, 2, 3, 4, 5]);
        expect(result).toMatchObject({ embedded: 5, unchanged: 0 });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(5);
    });

    it('does not re-embed unchanged products', async () => {
        const result = await sync().syncProducts([1, 2, 3, 4, 5]);
        expect(result).toMatchObject({ embedded: 0, unchanged: 5 });
        expect(calls).toHaveLength(0);
    });

    it('changes that do not affect the text cost nothing', async () => {
        await adminClient.query(gql`mutation { updateProduct(input: { id: "T_1", enabled: false }) { id } }`);
        await adminClient.query(gql`mutation { updateProductVariants(input: [{ id: "T_1", price: 999 }]) { id } }`);
        await settle();
        expect(calls).toHaveLength(0);
    });

    it('re-embeds an edited product, with HTML stripped', async () => {
        await adminClient.query(gql`
            mutation {
                updateProduct(input: { id: "T_2", translations: [{ languageCode: en, description: "<p>Great <b>zoom</b> &amp; optics</p>" }] }) { id }
            }
        `);
        await settle();
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(1);
        expect(calls[0][0]).toContain('Great zoom & optics');
        expect(calls[0][0]).not.toMatch(/<|&amp;/);
    });

    it('batches several quick edits into one request', async () => {
        for (const [id, text] of [['T_3', 'phone one'], ['T_4', 'tablet two'], ['T_5', 'headphones three']]) {
            await adminClient.query(
                gql`mutation($id: ID!, $d: String!) { updateProduct(input: { id: $id, translations: [{ languageCode: en, description: $d }] }) { id } }`,
                { id, d: text },
            );
        }
        await settle();
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(3);
    });

    it('removes the embedding of a deleted product', async () => {
        const store = server.app.get(ProductEmbeddingService);
        expect((await store.getEmbeddedHashes([5])).has(5)).toBe(true);
        await adminClient.query(gql`mutation { deleteProduct(id: "T_5") { result } }`);
        await settle();
        expect((await store.getEmbeddedHashes([5])).has(5)).toBe(false);
    });

    it('triggerEmbedAll only embeds what changed', async () => {
        await adminClient.query(gql`mutation { triggerEmbedAll { jobId } }`);
        await awaitRunningJobs(adminClient);
        // Products are all up to date; only the collection (never embedded) is new.
        expect(calls.flat()).toHaveLength(1);
        expect(calls.flat()[0]).toMatch(/Electronics/);
    });
});
