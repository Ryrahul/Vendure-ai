import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    DefaultCachePlugin,
    VendureConfig,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';
import { AiAssistantPlugin } from '@rahul_vendure/ai-chat-plugin';
import { AiChatDashboardPlugin } from '@rahul_vendure/ai-chat-dashboard';

const IS_DEV = process.env.APP_ENV === 'dev';
const serverPort = +process.env.PORT || 3000;

/** Ensure asset URL has trailing slash so GraphQL preview/source URLs are built correctly.  */
// todo: ai ma ni sidhai full url backend batai send
function normalizeAssetUrlPrefix(prefix: string | undefined): string | undefined {
    if (prefix == null || prefix === '') return prefix;
    return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        // The following options are useful in development mode,
        // but are best turned off for production for security
        // reasons.
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
        cors: IS_DEV
            ? { origin: true, credentials: true }
            : {
                origin: [
                    process.env.STOREFRONT_ORIGIN || 'https://vendure-ai-storefront.vercel.app',
                    'http://localhost:3001',
                ],
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
                allowedHeaders: ['Content-Type', 'Authorization', 'vendure-token', 'vendure-auth-token'],
            },
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
          secret: process.env.COOKIE_SECRET,
        },
        requireVerification: false,
    },
    dbConnectionOptions: {
        type: 'postgres',
        // See the README.md "Migrations" section for an explanation of
        // the `synchronize` and `migrations` options.
        synchronize: false,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    // When adding or altering custom field definitions, the database will
    // need to be updated. See the "Migrations" section in README.md.
    customFields: {},
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // For local dev, the correct value for assetUrlPrefix should
            // be guessed correctly, but for production it will usually need
            // to be set manually to match your production url.
            assetUrlPrefix: IS_DEV ? undefined : normalizeAssetUrlPrefix(process.env.ASSET_URL_PREFIX),
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultCachePlugin.init({ cacheSize: 10_000 }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        AiAssistantPlugin.init({
            openaiApiKey: process.env.OPENAI_API_KEY ?? '',
            embeddingModel: 'text-embedding-3-small',
            assetBaseUrl: IS_DEV ? undefined : normalizeAssetUrlPrefix(process.env.ASSET_URL_PREFIX),
            azureOpenai: process.env.AZURE_OPENAI_API_KEY ? {
                apiKey: process.env.AZURE_OPENAI_API_KEY,
                resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME ?? '',
                deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-4.1',
            } : undefined,
        }),
        EmailPlugin.init({
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                // The following variables will change depending on your storefront implementation.
                // Here we are assuming a storefront running at http://localhost:8080.
                fromAddress: '"example" <noreply@example.com>',
                verifyEmailAddressUrl: 'http://localhost:8080/verify',
                passwordResetUrl: 'http://localhost:8080/password-reset',
                changeEmailAddressUrl: 'http://localhost:8080/verify-email-address-change'
            },
        }),
        AiChatDashboardPlugin,
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV
                ? path.join(__dirname, '../dist/dashboard')
                : path.join(__dirname, 'dashboard'),
        }),
    ],
};
