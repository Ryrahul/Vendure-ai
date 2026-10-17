process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1'; // model calls fail fast; limits are checked before them

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ChatLimitsService } from '../src/services/chat-limits.service';
import { createAiTestEnvironment, http, PORT, serverInitOptions } from './utils/test-environment';

describe('rate limits and token budgets', () => {
    const { server, adminClient } = createAiTestEnvironment({
        limits: { shopMessagesPerMinute: 2, shopMessagesPerMinutePerIp: 4, shopTokensPerDay: 500, adminMessagesPerMinute: 1 },
    });
    let superToken: string;

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        const res = await fetch(`http://localhost:${PORT}/admin-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "superadmin") { __typename } }' }),
        });
        superToken = res.headers.get('vendure-auth-token') as string;
    });

    afterAll(async () => {
        await server.destroy();
    });

    async function guestSession(): Promise<string> {
        // Any Shop API mutation that needs a session creates an anonymous one.
        const res = await fetch(`http://localhost:${PORT}/shop-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation { addItemToOrder(productVariantId: "T_1", quantity: 1) { __typename } }' }),
        });
        return res.headers.get('vendure-auth-token') as string;
    }

    const ask = (token: string, message = 'hello') => http('POST', '/ai-assistant/chat', { token, body: { message } });

    it('limits messages per shopper per minute', async () => {
        const token = await guestSession();
        expect((await ask(token)).status).not.toBe(429);
        expect((await ask(token)).status).not.toBe(429);
        const third = await ask(token);
        expect(third.status).toBe(429);
        expect(third.body.message).toMatch(/Too many messages/);
    });

    it('does not count free greetings (no model call)', async () => {
        const token = await guestSession();
        for (let i = 0; i < 5; i++) {
            expect((await ask(token, '')).status).toBe(201);
        }
    });

    it('limits messages per IP across sessions', async () => {
        // Each new session has its own per-shopper allowance, but all come from the same IP,
        // which allows 4 messages per minute in total (2 were already used above).
        const results: number[] = [];
        for (let i = 0; i < 4; i++) {
            results.push((await ask(await guestSession())).status);
        }
        expect(results).toContain(429);
    });

    it('enforces the daily token budget', async () => {
        const limits = server.app.get(ChatLimitsService);
        await limits.recordUsage('shop', 'customer:budget-test', 600);
        await expect(limits.checkBeforeChat('shop', 'customer:budget-test')).rejects.toMatchObject({ status: 429 });
        // other shoppers are unaffected
        await expect(limits.checkBeforeChat('shop', 'customer:someone-else')).resolves.toBeUndefined();
    });

    it('limits administrator messages too', async () => {
        const chat = () => http('POST', '/admin-ai-chat/chat', { token: superToken, body: { message: 'hi' } });
        expect((await chat()).status).not.toBe(429);
        expect((await chat()).status).toBe(429);
    });
});
