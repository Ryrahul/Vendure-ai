import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { RequestContext, TransactionalConnection, ConfigService } from '@vendure/core';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions, MAX_CHAT_PRODUCTS } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
import { ChatResultMapper } from './chat-result-mapper';
import { AdminProductTools } from './admin-tools/admin-product-tools';
import { AdminOrderTools } from './admin-tools/admin-order-tools';
import { AdminCustomerTools } from './admin-tools/admin-customer-tools';
import { AdminCollectionTools } from './admin-tools/admin-collection-tools';
import { ADMIN_SYSTEM_PROMPT } from './admin-system-prompt';
import type { AiChatProduct, AiChatCollection, AiChatOrder } from './types';

export interface AdminChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    orders?: AiChatOrder[];
}

@Injectable()
export class AdminAiChatService implements OnModuleInit {
    private readonly logger = new Logger(AdminAiChatService.name);
    private openai: ReturnType<typeof createOpenAI>;
    private fulltextSearchService: any;
    private assetUrlPrefix: string = '';

    private mapper!: ChatResultMapper;
    private productTools!: AdminProductTools;
    private orderTools!: AdminOrderTools;
    private customerTools!: AdminCustomerTools;
    private collectionTools!: AdminCollectionTools;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private configService: ConfigService,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {
        this.openai = createOpenAI({ apiKey: options.openaiApiKey });
    }

    async onModuleInit() {
        // Resolve FulltextSearchService
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require('@vendure/core/dist/plugin/default-search-plugin/fulltext-search.service');
            this.fulltextSearchService = this.moduleRef.get(mod.FulltextSearchService, { strict: false });
            this.logger.log('FulltextSearchService resolved for admin chat');
        } catch {
            this.logger.warn('FulltextSearchService not available for admin chat');
        }

        // Resolve asset URL prefix
        if (this.options.assetBaseUrl) {
            this.assetUrlPrefix = this.options.assetBaseUrl.endsWith('/')
                ? this.options.assetBaseUrl
                : this.options.assetBaseUrl + '/';
        } else {
            try {
                const { apiOptions } = this.configService;
                const hostname = apiOptions.hostname || 'localhost';
                const port = apiOptions.port || 3000;
                this.assetUrlPrefix = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/assets/`;
            } catch {
                this.assetUrlPrefix = '/assets/';
            }
        }

        // Initialize helpers
        this.mapper = new ChatResultMapper(this.connection, this.assetUrlPrefix);
        this.productTools = new AdminProductTools(
            this.connection, this.mapper, this.fulltextSearchService,
            this.embeddingService, this.productEmbeddingService, this.collectionEmbeddingService,
        );
        this.orderTools = new AdminOrderTools(this.connection, this.mapper);
        this.customerTools = new AdminCustomerTools(this.connection);
        this.collectionTools = new AdminCollectionTools(this.connection);
    }

    private buildTools(ctx: RequestContext): ToolSet {
        return {
            searchProducts: tool({
                description: 'Search products by keyword. Returns product cards with images, prices, stock levels, and admin details.',
                inputSchema: z.object({
                    query: z.string().describe('Search term or product name'),
                    take: z.number().optional().describe('Number of results (default 10, max 25)'),
                    includeDisabled: z.boolean().optional().describe('Include disabled products (default false)'),
                }),
                execute: async (args) => this.productTools.searchProducts(ctx, args),
            }),
            vectorSearch: tool({
                description: 'Semantic/intent-based product search. Use for vague queries like "products for developers", "gaming accessories", "gifts for photographers". Falls back to this when keyword search returns no results.',
                inputSchema: z.object({
                    query: z.string().describe('The semantic search query'),
                }),
                execute: async (args) => this.productTools.vectorSearch(ctx, args),
            }),
            getProductDetails: tool({
                description: 'Get full details for a specific product including all variants with stock levels, prices, and SKUs.',
                inputSchema: z.object({
                    productId: z.string().optional().describe('Product ID'),
                    slug: z.string().optional().describe('Product slug'),
                }),
                execute: async (args) => this.productTools.getProductDetails(ctx, args),
            }),
            searchOrders: tool({
                description: 'Search orders across the store. Can filter by order code, customer name/email, or order state.',
                inputSchema: z.object({
                    orderCode: z.string().optional().describe('Order code to search for (partial match)'),
                    customerName: z.string().optional().describe('Customer name or email to filter by'),
                    state: z.string().optional().describe('Order state filter (e.g. PaymentSettled, Shipped, Delivered)'),
                    take: z.number().optional().describe('Number of results (default 10, max 25)'),
                }),
                execute: async (args) => this.orderTools.searchOrders(ctx, args),
            }),
            searchCustomers: tool({
                description: 'Search customers by name or email. Returns customer details including order count and total spent.',
                inputSchema: z.object({
                    query: z.string().describe('Customer name or email to search for'),
                    take: z.number().optional().describe('Number of results (default 10, max 25)'),
                }),
                execute: async (args) => this.customerTools.searchCustomers(ctx, args),
            }),
            getCollections: tool({
                description: 'List or search product collections/categories with product counts.',
                inputSchema: z.object({
                    query: z.string().optional().describe('Optional search term to filter collections'),
                    take: z.number().optional().describe('Number of results (default 20, max 50)'),
                }),
                execute: async (args) => this.collectionTools.getCollections(ctx, args),
            }),
        };
    }

    async chat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    ): Promise<AdminChatResult> {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: ADMIN_SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        const tools = this.buildTools(ctx);

        const result = streamText({
            model: this.openai('gpt-4o-mini'),
            messages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.7,
            maxOutputTokens: 2048,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const tr of step.toolResults) {
                        this.logger.log(`Admin tool "${tr.toolName}" completed`);
                    }
                }
            },
            onError: (event) => {
                this.logger.error(`Admin chat streamText error: ${event.error}`);
            },
        });

        const text = await result.text;
        const steps = await result.steps;

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let allOrders: AiChatOrder[] = [];

        for (const step of steps) {
            for (const toolResult of step.toolResults) {
                const data = (toolResult as any).output ?? (toolResult as any).result;
                if (!data) continue;
                if (data.products?.length > 0) {
                    allProducts = this.mapper.mergeProducts(allProducts, data.products);
                }
                if (data.collections?.length > 0) {
                    allCollections = this.mapper.mergeCollections(allCollections, data.collections);
                }
                if (data.orders?.length > 0) {
                    allOrders = data.orders;
                }
            }
        }

        return {
            message: text,
            products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, 5),
            orders: allOrders.length > 0 ? allOrders : undefined,
        };
    }
}
