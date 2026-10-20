import { TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { awaitRunningJobs, createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, http as request, PORT, serverInitOptions } from './utils/test-environment';

const DIMENSIONS = 8;

/**
 * A stand-in for Ollama / vLLM / LM Studio: the OpenAI Chat Completions (streaming, with
 * tool calls) and Embeddings endpoints. The first chat turn calls a tool; once the tool
 * result comes back, it answers.
 */
const calls: Array<{ path: string; body: any }> = [];
const fakeServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
        const body = raw ? JSON.parse(raw) : {};
        calls.push({ path: req.url ?? '', body });
        if (req.url === '/v1/embeddings') {
            const inputs: string[] = Array.isArray(body.input) ? body.input : [body.input];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
                JSON.stringify({
                    object: 'list',
                    model: body.model,
                    data: inputs.map((text, index) => ({
                        object: 'embedding',
                        index,
                        embedding: Array.from({ length: DIMENSIONS }, (_, j) => ((text.length + j) % 7) / 7 + 0.01),
                    })),
                    usage: { prompt_tokens: 5, total_tokens: 5 },
                }),
            );
            return;
        }
        if (req.url === '/v1/chat/completions') {
            const hasToolResult = body.messages.some((m: any) => m.role === 'tool');
            const base = { id: 'c1', object: 'chat.completion.chunk', created: 0, model: body.model };
            const chunks = hasToolResult
                ? [
                      { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'Answer from the local model.' }, finish_reason: null }] },
                      { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } },
                  ]
                : [
                      {
                          ...base,
                          choices: [
                              {
                                  index: 0,
                                  delta: {
                                      role: 'assistant',
                                      tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'getSalesSummary', arguments: '{"days":30}' } }],
                                  },
                                  finish_reason: null,
                              },
                          ],
                      },
                      { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
                  ];
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            res.end('data: [DONE]\n\n');
            return;
        }
        res.writeHead(404).end();
    });
});

let baseURL = '';
await new Promise<void>(resolve => fakeServer.listen(0, '127.0.0.1', resolve));
baseURL = `http://127.0.0.1:${(fakeServer.address() as AddressInfo).port}/v1`;

describe('openaiCompatible (self-hosted model from plain settings)', () => {
    const { server, adminClient } = createAiTestEnvironment({
        openaiApiKey: undefined,
        openaiCompatible: { baseURL, chatModel: 'local-chat', embeddingModel: 'local-embed', embeddingDimensions: DIMENSIONS, name: 'ollama' },
    });

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
    });

    afterAll(async () => {
        await server.destroy();
        await new Promise<void>(resolve => fakeServer.close(() => resolve()));
    });

    it('sizes the vector columns from openaiCompatible.embeddingDimensions', async () => {
        const [row] = await server.app.get(TransactionalConnection).rawConnection.query(
            `SELECT format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
              WHERE a.attname = 'embedding' AND c.relname = 'product_embedding'`,
        );
        expect(row.type).toBe(`vector(${DIMENSIONS})`);
    });

    it('embeds the catalog through the local server', async () => {
        await adminClient.query(gql`mutation { triggerEmbedAll { jobId } }`);
        await awaitRunningJobs(adminClient);
        const embedCalls = calls.filter(c => c.path === '/v1/embeddings');
        expect(embedCalls.length).toBeGreaterThan(0);
        expect(embedCalls[0].body.model).toBe('local-embed');
        const [row] = await server.app.get(TransactionalConnection).rawConnection.query(
            `SELECT COUNT(*)::int AS n FROM product_embedding WHERE embedding IS NOT NULL`,
        );
        expect(row.n).toBeGreaterThan(0);
    });

    it('runs the admin assistant with tool calls on the local chat model', async () => {
        const login = await fetch(`http://localhost:${PORT}/admin-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "superadmin") { __typename } }' }),
        });
        const token = login.headers.get('vendure-auth-token')!;
        const before = calls.length;
        const chat = await request('POST', '/admin-ai-chat/chat', { token, channelToken: DEFAULT_CHANNEL_TOKEN, body: { message: 'How are sales?' } });
        expect(chat.status).toBe(201);
        expect(chat.body.message).toBe('Answer from the local model.');

        const chatCalls = calls.slice(before).filter(c => c.path === '/v1/chat/completions');
        expect(chatCalls).toHaveLength(2); // tool call, then the answer
        expect(chatCalls[0].body.model).toBe('local-chat');
        expect(chatCalls[0].body.tools.some((t: any) => t.function.name === 'getSalesSummary')).toBe(true);
        const toolResult = chatCalls[1].body.messages.find((m: any) => m.role === 'tool');
        expect(String(toolResult.content)).toMatch(/Last 30 days: revenue/);

        const session = await request('GET', `/admin-ai-chat/sessions/${chat.body.sessionId}`, { token, channelToken: DEFAULT_CHANNEL_TOKEN });
        expect(session.body.model).toBe('ollama:local-chat');
    });
});
