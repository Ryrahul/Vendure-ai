process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { RequestContextService, TransactionalConnection, User } from '@vendure/core';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AiAssistantPlugin } from '../src/ai-assistant.plugin';
import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { EmbeddingService } from '../src/services/embedding.service';
import { awaitRunningJobs, createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, http, PORT, serverInitOptions } from './utils/test-environment';

const DIMENSIONS = 8;

/** A stand-in for any non-OpenAI embedding service: letter frequencies, 8 buckets. */
const embedCalls: string[][] = [];
async function embedTexts(texts: string[]) {
    embedCalls.push(texts);
    return texts.map(text => {
        const v = Array(DIMENSIONS).fill(0);
        for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % DIMENSIONS] += 1;
        const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
        return v.map(x => x / norm);
    });
}

const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** A non-OpenAI chat model: calls a tool on the first turn, then answers. */
let modelCalls = 0;
const chatModel = new MockLanguageModelV3({
    provider: 'acme-llm',
    modelId: 'acme-1',
    doStream: async () => {
        modelCalls++;
        const parts: any[] =
            modelCalls % 2 === 1
                ? [
                      { type: 'stream-start', warnings: [] },
                      { type: 'tool-call', toolCallId: `c${modelCalls}`, toolName: 'getSalesSummary', input: JSON.stringify({ days: 30 }) },
                      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
                  ]
                : [
                      { type: 'stream-start', warnings: [] },
                      { type: 'text-start', id: 't' },
                      { type: 'text-delta', id: 't', delta: 'Answer from the custom model.' },
                      { type: 'text-end', id: 't' },
                      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
                  ];
        return { stream: convertArrayToReadableStream(parts) };
    },
});

describe('custom model providers (no OpenAI key)', () => {
    const { server, adminClient } = createAiTestEnvironment({
        openaiApiKey: undefined,
        chatModel,
        embedTexts,
        embeddingDimensions: DIMENSIONS,
    });

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('sizes the vector columns to embeddingDimensions', async () => {
        const rows = await server.app.get(TransactionalConnection).rawConnection.query(
            `SELECT c.relname AS "table", format_type(a.atttypid, a.atttypmod) AS type
               FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
              WHERE a.attname = 'embedding' AND c.relname IN ('product_embedding', 'variant_embedding', 'collection_embedding')`,
        );
        expect(rows).toHaveLength(3);
        for (const row of rows) expect(row.type).toBe(`vector(${DIMENSIONS})`);
    });

    it('embeds the catalog with the custom function', async () => {
        await adminClient.query(gql`mutation { triggerEmbedAll { jobId } }`);
        await awaitRunningJobs(adminClient);
        const [row] = await server.app.get(TransactionalConnection).rawConnection.query(
            `SELECT COUNT(*)::int AS n, MIN(vector_dims(embedding)) AS dims FROM product_embedding WHERE embedding IS NOT NULL`,
        );
        expect(row.n).toBeGreaterThan(0);
        expect(row.dims).toBe(DIMENSIONS);
        expect(embedCalls.flat().length).toBeGreaterThan(0);
    });

    it('explains a dimension mismatch instead of failing in the database', async () => {
        const service = server.app.get(EmbeddingService);
        const original = (service as any).customEmbed;
        (service as any).customEmbed = async (texts: string[]) => texts.map(() => [1, 2, 3]);
        try {
            await expect(service.embed('camera')).rejects.toThrow(/returned 3 dimensions, but embeddingDimensions is 8/);
        } finally {
            (service as any).customEmbed = original;
        }
    });

    it('runs the admin assistant, with tools, on the custom chat model', async () => {
        const res = await fetch(`http://localhost:${PORT}/admin-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "superadmin") { __typename } }' }),
        });
        const token = res.headers.get('vendure-auth-token')!;
        const chat = await http('POST', '/admin-ai-chat/chat', { token, channelToken: DEFAULT_CHANNEL_TOKEN, body: { message: 'How are sales?' } });
        expect(chat.status).toBe(201);
        expect(chat.body.message).toBe('Answer from the custom model.');
        expect(chat.body.insights?.[0]?.type).toBe('salesSummary'); // the tool ran
        const session = await http('GET', `/admin-ai-chat/sessions/${chat.body.sessionId}`, { token, channelToken: DEFAULT_CHANNEL_TOKEN });
        expect(session.body.model).toBe('acme-llm:acme-1');
    });

    it('offers no web search without an OpenAI key or a webSearch function', async () => {
        const user = await server.app.get(TransactionalConnection).rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: 'superadmin' },
            relations: ['roles', 'roles.channels'],
        });
        const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN });
        const tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 }) as any;
        expect(tools.searchWeb).toBeUndefined();
        expect(tools.fetchWebPage).toBeDefined();
    });
});

describe('plugin options validation', () => {
    it('fails at startup without any chat model', () => {
        expect(() => AiAssistantPlugin.init({ embedTexts })).toThrow(/configure a chat model/);
    });

    it('fails at startup without any embedding source', () => {
        expect(() => AiAssistantPlugin.init({ chatModel })).toThrow(/embeddings need/);
    });

    it('rejects an invalid embeddingDimensions', () => {
        expect(() => AiAssistantPlugin.init({ chatModel, embedTexts, embeddingDimensions: 0 })).toThrow(/embeddingDimensions/);
    });
});
