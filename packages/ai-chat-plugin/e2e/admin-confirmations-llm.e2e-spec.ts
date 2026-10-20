/**
 * Opt-in: runs the real model (OPENAI_API_KEY_E2E) to check it requests — but never
 * performs or claims — a destructive action, and that the dashboard gets the
 * pending confirmation. Skipped when the key is not set.
 */
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, http, PORT, serverInitOptions } from './utils/test-environment';

const apiKey = process.env.OPENAI_API_KEY_E2E;

describe.skipIf(!apiKey)('admin confirmations with the real model', () => {
    const { server, adminClient } = createAiTestEnvironment({ openaiApiKey: apiKey ?? 'skipped' });
    let token: string;

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        const res = await fetch(`http://localhost:${PORT}/admin-api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "superadmin") { __typename } }' }),
        });
        token = res.headers.get('vendure-auth-token') as string;
    });

    afterAll(async () => {
        await server.destroy();
    });

    const exists = async () => !!(await adminClient.query(gql`{ product(id: "T_5") { id } }`)).product;

    it('requests the delete, does not perform it, and does not claim it is done', async () => {
        const chat = await http('POST', '/admin-ai-chat/chat', {
            token,
            channelToken: DEFAULT_CHANNEL_TOKEN,
            body: { message: 'Delete the product with ID 5 (Headphones).' },
        });
        expect(chat.status).toBe(201);
        expect(chat.body.pendingConfirmations).toHaveLength(1);
        expect(chat.body.pendingConfirmations[0]).toMatchObject({ toolName: 'deleteProduct' });
        expect(chat.body.message).not.toMatch(/has been (successfully )?deleted|deleted successfully/i);
        expect(await exists()).toBe(true);

        const confirmed = await http('POST', '/admin-ai-chat/confirm', {
            token,
            channelToken: DEFAULT_CHANNEL_TOKEN,
            body: { confirmationId: chat.body.pendingConfirmations[0].id },
        });
        expect(confirmed.body.success).toBe(true);
        expect(await exists()).toBe(false);

        // The outcome is in the session, so the model knows on the next turn.
        const session = await http('GET', `/admin-ai-chat/sessions/${chat.body.sessionId}`, { token });
        expect(session.body.messages.map((m: any) => m.content).join('\n')).toMatch(/Confirmed: Delete product/);
    }, 120_000);
});
