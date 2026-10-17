/**
 * Destructive admin actions requested by the model only run after the administrator
 * presses Confirm (a separate HTTP call the model cannot make).
 */
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { CurrencyCode, LanguageCode, RequestContext, RequestContextService, TransactionalConnection, User } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, http, PORT, serverInitOptions } from './utils/test-environment';

const CHANNEL_B_TOKEN = 'confirm-channel-b';

async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`http://localhost:${PORT}/admin-api`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            query: `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
            variables: { u: username, p: password },
        }),
    });
    return res.headers.get('vendure-auth-token') as string;
}

describe('admin action confirmations', () => {
    const { server, adminClient } = createAiTestEnvironment();
    const admins: Record<string, { id: string; token: string; ctx: RequestContext }> = {};

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        const { zones } = await adminClient.query(gql`{ zones { items { id } } }`);
        const { createChannel } = await adminClient.query(
            gql`mutation($input: CreateChannelInput!) { createChannel(input: $input) { ... on Channel { id } } }`,
            {
                input: {
                    code: 'confirm-b',
                    token: CHANNEL_B_TOKEN,
                    defaultLanguageCode: LanguageCode.en,
                    pricesIncludeTax: false,
                    defaultCurrencyCode: CurrencyCode.USD,
                    defaultShippingZoneId: zones.items[0].id,
                    defaultTaxZoneId: zones.items[0].id,
                },
            },
        );
        const { createRole } = await adminClient.query(
            gql`mutation($input: CreateRoleInput!) { createRole(input: $input) { id } }`,
            {
                input: {
                    code: 'catalog-ai',
                    description: 'catalog + ai',
                    permissions: ['UseAiAdminAssistant', 'ReadCatalog', 'UpdateCatalog', 'DeleteCatalog'],
                    channelIds: ['T_1', createChannel.id],
                },
            },
        );
        for (const name of ['alice', 'bob']) {
            const email = `${name}@test.com`;
            const { createAdministrator } = await adminClient.query(
                gql`mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
                { input: { firstName: name, lastName: 'x', emailAddress: email, password: 'test', roleIds: [createRole.id] } },
            );
            const user = await server.app
                .get(TransactionalConnection)
                .rawConnection.getRepository(User)
                .findOneOrFail({ where: { identifier: email }, relations: ['roles', 'roles.channels'] });
            admins[name] = {
                id: String(createAdministrator.id).replace(/^T_/, ''),
                token: await login(email, 'test'),
                ctx: await server.app
                    .get(RequestContextService)
                    .create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN }),
            };
        }
    });

    afterAll(async () => {
        await server.destroy();
    });

    const tools = (name: string) =>
        server.app.get(AdminAiChatService).getTools(admins[name].ctx, { administratorId: admins[name].id }) as any;

    async function productExists(id: string) {
        const { product } = await adminClient.query(gql`query($id: ID!) { product(id: $id) { id } }`, { id });
        return !!product;
    }

    async function requestDelete(admin: string, productId: string): Promise<string> {
        const result = await tools(admin).deleteProduct.execute({ productId }, { toolCallId: 't', messages: [] });
        expect(result.confirmationRequired).toBe(true);
        expect(result.summary).toMatch(/^NOT DONE YET/);
        expect(result.confirmation.description).toBe(`Delete product (productId: ${productId})`);
        return result.confirmation.id;
    }

    const confirm = (admin: string, confirmationId: string, channelToken = DEFAULT_CHANNEL_TOKEN) =>
        http('POST', '/admin-ai-chat/confirm', { token: admins[admin].token, channelToken, body: { confirmationId } });

    it('the model can only request a delete — nothing is deleted yet', async () => {
        await requestDelete('alice', '5');
        expect(await productExists('T_5')).toBe(true);
    });

    it('non-destructive tools still run directly', async () => {
        const result = await tools('alice').getCollections.execute({}, { toolCallId: 't', messages: [] });
        expect(result.confirmationRequired).toBeUndefined();
        expect(result.summary).not.toMatch(/NOT DONE/);
    });

    it("another administrator cannot confirm someone else's action", async () => {
        const id = await requestDelete('alice', '4');
        expect((await confirm('bob', id)).status).toBe(404);
        expect(await productExists('T_4')).toBe(true);
        // ...and it is still available to its owner
        expect((await confirm('alice', id)).body).toMatchObject({ success: true });
        expect(await productExists('T_4')).toBe(false);
    });

    it('the owner confirms once; the confirmation cannot be replayed', async () => {
        const id = await requestDelete('alice', '3');
        const first = await confirm('alice', id);
        expect(first.status).toBe(201);
        expect(first.body.success).toBe(true);
        expect(first.body.summary).toMatch(/successfully deleted/);
        expect(await productExists('T_3')).toBe(false);
        expect((await confirm('alice', id)).status).toBe(404);
    });

    it('a cancelled action can no longer be confirmed', async () => {
        const id = await requestDelete('alice', '2');
        const cancelled = await http('POST', '/admin-ai-chat/cancel', {
            token: admins.alice.token,
            channelToken: DEFAULT_CHANNEL_TOKEN,
            body: { confirmationId: id },
        });
        expect(cancelled.body).toEqual({ success: true });
        expect((await confirm('alice', id)).status).toBe(404);
        expect(await productExists('T_2')).toBe(true);
    });

    it('is not executed in a different channel than it was requested in', async () => {
        const id = await requestDelete('alice', '1');
        const res = await confirm('alice', id, CHANNEL_B_TOKEN);
        expect(res.body.success).toBe(false);
        expect(res.body.summary).toMatch(/another channel/);
        expect(await productExists('T_1')).toBe(true);
    });

    it('rejects garbage and anonymous confirmations', async () => {
        expect((await confirm('alice', 'not-a-uuid')).status).toBe(404);
        expect((await http('POST', '/admin-ai-chat/confirm', { body: { confirmationId: 'x' } })).status).toBe(403);
    });
});
