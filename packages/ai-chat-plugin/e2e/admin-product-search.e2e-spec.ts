process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';

import { RequestContextService, TransactionalConnection, User } from '@vendure/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminAiChatService } from '../src/services/admin-ai-chat.service';
import { awaitRunningJobs, createAiTestEnvironment, DEFAULT_CHANNEL_TOKEN, serverInitOptions } from './utils/test-environment';

describe('admin product search by collection', () => {
    const { server, adminClient } = createAiTestEnvironment();
    let tools: any;
    const run = (args: object) => tools.searchProducts.execute(args, { toolCallId: 't', messages: [] });
    const names = (result: any) => result.products.map((p: any) => p.name).sort();

    beforeAll(async () => {
        await server.init(serverInitOptions);
        await adminClient.asSuperAdmin();
        await awaitRunningJobs(adminClient); // collection filters are applied by a job
        const user = await server.app.get(TransactionalConnection).rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: 'superadmin' },
            relations: ['roles', 'roles.channels'],
        });
        const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin', user, channelOrToken: DEFAULT_CHANNEL_TOKEN });
        tools = server.app.get(AdminAiChatService).getTools(ctx, { administratorId: 1 });
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('lists the products of a collection by name or slug', async () => {
        const result = await run({ collection: 'Electronics' });
        expect(names(result)).toEqual(['Camera', 'Laptop', 'Phone', 'Tablet']);
        expect(result.summary).toMatch(/in collection "Electronics"/);
        expect(names(await run({ collection: 'electronics' }))).toEqual(['Camera', 'Laptop', 'Phone', 'Tablet']);
    });

    it('a keyword that names a collection returns its products instead of nothing', async () => {
        const result = await run({ query: 'electronics' });
        expect(names(result)).toEqual(['Camera', 'Laptop', 'Phone', 'Tablet']);
        expect(result.summary).toMatch(/in collection "Electronics"/);
    });

    it('keeps all variants of the matched products (not only those in the collection)', async () => {
        const laptop = (await run({ collection: 'Electronics' })).products.find((p: any) => p.name === 'Laptop');
        expect(laptop).toBeDefined();
        const plain = (await run({ query: 'laptop' })).summary;
        expect(plain).toMatch(/2 variants/);
    });

    it('combines keyword and collection, and explains an unknown collection', async () => {
        expect(names(await run({ query: 'cam', collection: 'Electronics' }))).toEqual(['Camera']);
        expect((await run({ collection: 'Garden' })).summary).toMatch(/No collection named "Garden"/);
        expect((await run({ query: 'nothing-like-this' })).summary).toMatch(/No products found matching/);
    });
});
