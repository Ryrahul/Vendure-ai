import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { RequestContext, TransactionalConnection, ConfigService } from '@vendure/core';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions } from '../constants';
import { AdminProductTools } from './admin-tools/admin-product-tools';
import { AdminOrderTools } from './admin-tools/admin-order-tools';
import { AdminCustomerTools } from './admin-tools/admin-customer-tools';
import { AdminCollectionTools } from './admin-tools/admin-collection-tools';
import { ADMIN_SYSTEM_PROMPT } from './admin-system-prompt';

@Injectable()
export class AdminAiChatService implements OnModuleInit {
    private readonly logger = new Logger(AdminAiChatService.name);
    private openai: ReturnType<typeof createOpenAI>;
    private fulltextSearchService: any;

    private productTools!: AdminProductTools;
    private orderTools!: AdminOrderTools;
    private customerTools!: AdminCustomerTools;
    private collectionTools!: AdminCollectionTools;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private configService: ConfigService,
    ) {
        this.openai = createOpenAI({ apiKey: options.openaiApiKey });
    }

    async onModuleInit() {
        // Resolve FulltextSearchService for product search
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require('@vendure/core/dist/plugin/default-search-plugin/fulltext-search.service');
            this.fulltextSearchService = this.moduleRef.get(mod.FulltextSearchService, { strict: false });
            this.logger.log('FulltextSearchService resolved for admin chat');
        } catch {
            this.logger.warn('FulltextSearchService not available for admin chat');
        }

        // Initialize tool classes
        this.productTools = new AdminProductTools(this.connection, this.fulltextSearchService);
        this.orderTools = new AdminOrderTools(this.connection);
        this.customerTools = new AdminCustomerTools(this.connection);
        this.collectionTools = new AdminCollectionTools(this.connection);
    }

    private buildTools(ctx: RequestContext): ToolSet {
        return {
            searchProducts: tool({
                description: 'Search products by keyword. Returns admin-level details including stock levels, enabled status, variant count, and price ranges.',
                inputSchema: z.object({
                    query: z.string().describe('Search term or product name'),
                    take: z.number().optional().describe('Number of results (default 10, max 25)'),
                    includeDisabled: z.boolean().optional().describe('Include disabled products (default false)'),
                }),
                execute: async (args) => this.productTools.searchProducts(ctx, args),
            }),
            getProductDetails: tool({
                description: 'Get full details for a specific product including all variants with stock levels, prices, and SKUs. Use when admin asks about a specific product.',
                inputSchema: z.object({
                    productId: z.string().optional().describe('Product ID'),
                    slug: z.string().optional().describe('Product slug'),
                }),
                execute: async (args) => this.productTools.getProductDetails(ctx, args),
            }),
            searchOrders: tool({
                description: 'Search orders across the store. Can filter by order code, customer name/email, or order state (e.g. "PaymentSettled", "Shipped", "Delivered", "Cancelled").',
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
                description: 'List or search product collections/categories. Returns collection names, slugs, and product counts.',
                inputSchema: z.object({
                    query: z.string().optional().describe('Optional search term to filter collections'),
                    take: z.number().optional().describe('Number of results (default 20, max 50)'),
                }),
                execute: async (args) => this.collectionTools.getCollections(ctx, args),
            }),
        };
    }

    /**
     * Non-streaming admin chat. Returns the full response after all tool calls complete.
     */
    async chat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    ): Promise<{ message: string }> {
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
        return { message: text };
    }
}
