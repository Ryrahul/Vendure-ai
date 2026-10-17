import { mergeConfig, VendureConfig, VendurePlugin } from '@vendure/core';
import { createTestEnvironment, PostgresInitializer, registerInitializer, testConfig } from '@vendure/testing';
import gql from 'graphql-tag';
import path from 'path';
import { Client } from 'pg';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { AiAssistantPlugin, AiAssistantPluginOptions } from '../../src';
import { initialData } from '../fixtures/initial-data';

export const PORT = 3060;
export const DEFAULT_CHANNEL_TOKEN = 'e2e-default-channel';

/**
 * PostgresInitializer that also enables pgvector in each fresh test database, so that
 * `synchronize` can create the plugin's `vector` columns.
 */
class PgVectorInitializer extends PostgresInitializer {
    async init(testFileName: string, connectionOptions: PostgresConnectionOptions) {
        const options = await super.init(testFileName, connectionOptions);
        const client = new Client({
            host: options.host,
            port: options.port,
            user: options.username,
            password: options.password as string,
            database: options.database as string,
        });
        await client.connect();
        await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        await client.end();
        return options;
    }
}

registerInitializer('postgres', new PgVectorInitializer());

export const serverInitOptions = {
    initialData,
    productsCsvPath: path.join(__dirname, '../fixtures/products.csv'),
    customerCount: 2,
};

export function createAiTestEnvironment(
    options: Partial<AiAssistantPluginOptions> = {},
    plugins: VendureConfig['plugins'] = [],
) {
    const base: VendureConfig =
        typeof testConfig === 'function' ? (testConfig as any)(PORT) : (testConfig as VendureConfig);
    const config = mergeConfig(base, {
        apiOptions: { port: PORT },
        // Avoid loading the native bcrypt module in tests (its binary needs an install script).
        authOptions: {
            passwordHashingStrategy: {
                hash: async (plaintext: string) => `plain:${plaintext}`,
                check: async (plaintext: string, hash: string) => hash === `plain:${plaintext}`,
            },
        },
        dbConnectionOptions: {
            type: 'postgres',
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            username: process.env.PGUSER ?? 'postgres',
            password: process.env.PGPASSWORD ?? '',
            synchronize: true,
        },
        plugins: [
            ...(plugins ?? []),
            // No real OpenAI calls are made by these tests.
            AiAssistantPlugin.init({ openaiApiKey: 'test-key', ...options }),
        ],
    } as any);
    return createTestEnvironment(config as Required<VendureConfig>);
}

const GET_UNSETTLED_JOBS = gql`
    query {
        jobs(options: { filter: { isSettled: { eq: false } } }) {
            totalItems
        }
    }
`;

export async function awaitRunningJobs(adminClient: any, timeoutMs = 15_000) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 150));
    while (Date.now() - start < timeoutMs) {
        const { jobs } = await adminClient.query(GET_UNSETTLED_JOBS);
        if (jobs.totalItems === 0) {
            return;
        }
        await new Promise(r => setTimeout(r, 150));
    }
    throw new Error('Jobs did not settle');
}

/** Raw HTTP call to the server (used for the REST chat endpoints). */
export async function http(
    method: 'GET' | 'POST' | 'DELETE',
    urlPath: string,
    opts: { token?: string; channelToken?: string; body?: unknown } = {},
) {
    const res = await fetch(`http://localhost:${PORT}${urlPath}`, {
        method,
        headers: {
            'content-type': 'application/json',
            ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
            ...(opts.channelToken ? { 'vendure-token': opts.channelToken } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }
    return { status: res.status, body: json };
}

export { VendurePlugin };
