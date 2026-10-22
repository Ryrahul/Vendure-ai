import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { toModelInput } from './prompt-utils';
import { z } from 'zod';
import { ActiveOrderService, RequestContext, TransactionalConnection, OrderService, CustomerService, ConfigService } from '@vendure/core';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions, MAX_CHAT_PRODUCTS, MAX_CHAT_COLLECTIONS } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
import { ChatResultMapper } from './chat-result-mapper';
import { StorefrontApiService } from './storefront-api.service';
import { SearchTools } from './tools/search-tools';
import { ActiveOrderLookup } from './tools/active-order-lookup';
import { SHOP_WRITE_TOOLS, withWriteTransactions } from './tool-transactions';
import { CartTools } from './tools/cart-tools';
import { OrderTools } from './tools/order-tools';
import { CheckoutTools } from './tools/checkout-tools';
import { PromotionTools } from './tools/promotion-tools';
import { SYSTEM_PROMPT } from './system-prompt';
import { type ChatModels, resolveChatModels, withFallback } from './model-provider';
import type {
    AiChatProduct,
    AiChatCollection,
    AddToCartAction,
    AiChatOrder,
    AiChatOrderLine,
    AiActiveOrder,
    AiCartLine,
    AiPromotion,
    ApplyCouponAction,
    SetShippingAddressAction,
    SetBillingAddressAction,
    SetShippingMethodAction,
    ChatResult,
    StreamingChatResult,
    AiTokenUsage,
} from './types';

// Re-export all types so existing consumers that import from this file continue to work
export type {
    AiChatProduct,
    AiChatCollection,
    AddToCartAction,
    AiChatOrder,
    AiChatOrderLine,
    AiActiveOrder,
    AiCartLine,
    AiPromotion,
    ApplyCouponAction,
    SetShippingAddressAction,
    SetBillingAddressAction,
    SetShippingMethodAction,
    ChatResult,
    StreamingChatResult,
    AiTokenUsage,
};

// Tool definitions are created inline in the chat/streamChat methods using Vercel AI SDK tool() + zod schemas

@Injectable()
export class AiChatService implements OnModuleInit {
    private readonly logger = new Logger(AiChatService.name);
    private models: ChatModels;
    private assetUrlPrefix: string = '';

    private mapper!: ChatResultMapper;
    private searchTools!: SearchTools;
    private cartTools!: CartTools;
    private orderTools!: OrderTools;
    private checkoutTools!: CheckoutTools;
    private promotionTools!: PromotionTools;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private orderService: OrderService,
        private customerService: CustomerService,
        private configService: ConfigService,
        private storefrontApiService: StorefrontApiService,
        private activeOrderService: ActiveOrderService,
    ) {
        this.models = resolveChatModels(options);
    }

    async onModuleInit() {
        // Resolve asset URL prefix: explicit config > auto-detect from apiOptions
        if (this.options.assetBaseUrl) {
            this.assetUrlPrefix = this.options.assetBaseUrl.endsWith('/')
                ? this.options.assetBaseUrl
                : this.options.assetBaseUrl + '/';
            this.logger.log(`Asset URL prefix from config: ${this.assetUrlPrefix}`);
        } else {
            try {
                const { apiOptions } = this.configService;
                const hostname = apiOptions.hostname || 'localhost';
                const port = apiOptions.port || 3000;
                this.assetUrlPrefix = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/assets/`;
                this.logger.log(`Asset URL prefix auto-detected: ${this.assetUrlPrefix}`);
            } catch (e) {
                this.assetUrlPrefix = '/assets/';
                this.logger.warn(`Could not resolve asset URL prefix, using relative: ${this.assetUrlPrefix}`);
            }
        }

        // Initialize helper classes
        this.mapper = new ChatResultMapper(this.connection, this.assetUrlPrefix);
        this.searchTools = new SearchTools(
            this.storefrontApiService,
            this.embeddingService,
            this.productEmbeddingService,
            this.collectionEmbeddingService,
            this.mapper,
        );
        const activeOrders = new ActiveOrderLookup(this.activeOrderService);
        this.cartTools = new CartTools(this.connection, this.orderService, this.mapper, activeOrders);
        this.orderTools = new OrderTools(this.connection, this.mapper);
        this.checkoutTools = new CheckoutTools(this.connection, this.orderService, activeOrders);
        this.promotionTools = new PromotionTools(this.connection, this.orderService, activeOrders, this.options.exposeCouponCodes ?? false);
    }

    private buildTools(ctx: RequestContext, customerId?: string | number): ToolSet {
        return {
            searchProducts: tool({
                description:
                    'Search for products by keyword and/or collection (category). Use collection to list what a category contains ("what do you have in computers?"). Returns products with their id, name, slug, price, image, and variantId.',
                inputSchema: z.object({
                    query: z.string().optional().describe('The search term or product keyword'),
                    collection: z.string().optional().describe('Collection (category) name or slug, e.g. "Computers"'),
                    take: z.number().optional().describe('Number of results to return (default 10, max 20)'),
                }),
                execute: async ({ query, collection, take }) => this.searchTools.searchProducts(ctx, { query, collection, take }),
            }),
            vectorSearch: tool({
                description: 'Semantic/intent-based product search. Use for vague queries like "gift for dad", "something romantic".',
                inputSchema: z.object({
                    query: z.string().describe('The semantic search query'),
                }),
                execute: async ({ query }) => this.searchTools.vectorSearch(ctx, { query }),
            }),
            getCollections: tool({
                description: 'Get available product collections/categories in the store.',
                inputSchema: z.object({
                    query: z.string().optional().describe('Optional search term to filter collections'),
                }),
                execute: async ({ query }) => this.searchTools.getCollections(ctx, { query }),
            }),
            filterByPrice: tool({
                description: 'Filter products by price range / budget, using the price the customer pays (tax included) in the store currency. Prices are in the smallest currency unit, e.g. "under 50" = maxPrice 5000.',
                inputSchema: z.object({
                    minPrice: z.number().optional().describe('Min price in cents'),
                    maxPrice: z.number().optional().describe('Max price in cents'),
                    query: z.string().optional().describe('Optional keyword to narrow results (e.g. "laptop")'),
                }),
                execute: async ({ minPrice, maxPrice, query }) => this.searchTools.filterByPrice(ctx, { minPrice, maxPrice, query }),
            }),
            addToCart: tool({
                description: 'Add a product to the customer\'s shopping cart. The variantId MUST be the exact variantId from a previous search result. Never guess or fabricate a variantId.',
                inputSchema: z.object({
                    variantId: z.string().describe('The EXACT numeric variant ID from a previous search result'),
                    quantity: z.number().optional().describe('Quantity to add (default 1)'),
                    productName: z.string().optional().describe('The product name (for confirmation)'),
                }),
                execute: async ({ variantId, quantity, productName }) => this.cartTools.addToCart(ctx, { variantId, quantity, productName }),
            }),
            getActiveOrder: tool({
                description: 'Get the customer\'s current shopping cart (active order). Returns all line items with product names, quantities, prices, and the cart total.',
                inputSchema: z.object({}),
                execute: async () => this.cartTools.getActiveOrder(ctx, {}),
            }),
            adjustOrderLine: tool({
                description: 'Adjust the quantity of an item in the customer\'s cart, or remove it. Requires the orderLineId from getActiveOrder results. Set quantity to 0 to remove the item.',
                inputSchema: z.object({
                    orderLineId: z.string().describe('The order line ID from getActiveOrder results'),
                    quantity: z.number().describe('The new absolute quantity. Set to 0 to remove.'),
                }),
                execute: async ({ orderLineId, quantity }) => this.cartTools.adjustOrderLine(ctx, { orderLineId, quantity }),
            }),
            getOrderHistory: tool({
                description: 'Get the customer\'s past orders. Returns a list of orders with code, state, total, date, and items ordered.',
                inputSchema: z.object({
                    take: z.number().optional().describe('Max number of orders to return (default 5, max 10)'),
                }),
                execute: async ({ take }) => this.orderTools.getOrderHistory(ctx, { take }, customerId),
            }),
            trackOrder: tool({
                description: 'Get the status and tracking information for a specific order.',
                inputSchema: z.object({
                    orderId: z.string().optional().describe('The order ID (numeric)'),
                    orderCode: z.string().optional().describe('The order code (e.g. "A1B2C3D4")'),
                }),
                execute: async ({ orderId, orderCode }) => this.orderTools.trackOrder(ctx, { orderId, orderCode }, customerId),
            }),
            getAvailableCountries: tool({
                description: 'List countries available for shipping/billing addresses.',
                inputSchema: z.object({}),
                execute: async () => this.checkoutTools.getAvailableCountries(ctx),
            }),
            getEligibleShippingMethods: tool({
                description: 'Get available shipping methods for the active order. Call after the shipping address has been set.',
                inputSchema: z.object({}),
                execute: async () => this.checkoutTools.getEligibleShippingMethods(ctx),
            }),
            setShippingAddress: tool({
                description: 'Set the shipping address on the active order. Requires all address fields.',
                inputSchema: z.object({
                    fullName: z.string().describe('Full name of the recipient'),
                    streetLine1: z.string().describe('Street address line 1'),
                    streetLine2: z.string().optional().describe('Street address line 2'),
                    city: z.string().describe('City'),
                    province: z.string().describe('State/province'),
                    postalCode: z.string().describe('Postal/ZIP code'),
                    countryCode: z.string().describe('Two-letter country code (e.g. "US", "GB")'),
                    phoneNumber: z.string().describe('Phone number'),
                    company: z.string().optional().describe('Company name'),
                }),
                execute: async (params) => this.checkoutTools.setShippingAddress(ctx, params),
            }),
            setBillingAddress: tool({
                description: 'Set the billing address on the active order. Can be the same as shipping address.',
                inputSchema: z.object({
                    fullName: z.string().describe('Full name'),
                    streetLine1: z.string().describe('Street address line 1'),
                    streetLine2: z.string().optional().describe('Street address line 2'),
                    city: z.string().describe('City'),
                    province: z.string().describe('State/province'),
                    postalCode: z.string().describe('Postal/ZIP code'),
                    countryCode: z.string().describe('Two-letter country code'),
                    phoneNumber: z.string().describe('Phone number'),
                    company: z.string().optional().describe('Company name'),
                }),
                execute: async (params) => this.checkoutTools.setBillingAddress(ctx, params),
            }),
            getEligiblePaymentMethods: tool({
                description: 'Get available payment methods for the active order. Use this when the customer asks how they can pay or wants to proceed to checkout.',
                inputSchema: z.object({}),
                execute: async () => this.checkoutTools.getEligiblePaymentMethods(ctx),
            }),
            setShippingMethod: tool({
                description: 'Set the chosen shipping method on the active order. Use the id from getEligibleShippingMethods.',
                inputSchema: z.object({
                    shippingMethodId: z.string().describe('The shipping method ID from getEligibleShippingMethods'),
                }),
                execute: async ({ shippingMethodId }) => this.checkoutTools.setShippingMethod(ctx, { shippingMethodId }),
            }),
            getAvailablePromotions: tool({
                description: 'Get all currently active promotions and deals available in the store. Shows both automatic promotions and coupon-based promotions with their discount details and conditions.',
                inputSchema: z.object({}),
                execute: async () => this.promotionTools.getAvailablePromotions(ctx),
            }),
            applyCouponCode: tool({
                description: 'Apply a coupon/promo code to the customer\'s active order. The customer must be logged in and have items in their cart.',
                inputSchema: z.object({
                    couponCode: z.string().describe('The coupon code to apply'),
                }),
                execute: async ({ couponCode }) => this.promotionTools.applyCouponCode(ctx, { couponCode }),
            }),
            removeCouponCode: tool({
                description: 'Remove a previously applied coupon code from the customer\'s active order.',
                inputSchema: z.object({
                    couponCode: z.string().describe('The coupon code to remove'),
                }),
                execute: async ({ couponCode }) => this.promotionTools.removeCouponCode(ctx, { couponCode }),
            }),
            getCartDiscounts: tool({
                description: 'Get details about discounts currently applied to the cart, applied coupon codes, and promotions the customer is close to qualifying for (e.g. "spend $X more to get free shipping").',
                inputSchema: z.object({}),
                execute: async () => this.promotionTools.getCartDiscounts(ctx),
            }),

        };
    }

    streamChat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        customerId?: string | number,
        abortSignal?: AbortSignal,
    ): ReturnType<typeof streamText> {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        const tools = withWriteTransactions(this.connection, ctx, this.buildTools(ctx, customerId), name => SHOP_WRITE_TOOLS.has(name), txCtx => this.buildTools(txCtx, customerId));

        // OpenAI is primary model
        return streamText({
            model: this.models.primary,
            abortSignal,
            ...toModelInput(messages),
            tools,
            stopWhen: stepCountIs(12),
            temperature: 0.7,
            maxOutputTokens: 1024,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const result of step.toolResults) {
                        this.logger.debug(`Tool "${result.toolName}" completed`);
                    }
                }
            },
            onError: (event) => {
                this.logger.error(`streamText error: ${event.error}`);
            },
        });
    }

    // yo chai stream bina use garna paryo vanee kailee
    async chat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        customerId?: string | number,
    ): Promise<ChatResult> {
        return withFallback(this.models, this.logger, model => this.runShopChat(ctx, userMessage, conversationHistory, customerId, model));
    }

    private async runShopChat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
        customerId: string | number | undefined,
        model: any,
    ): Promise<ChatResult> {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        const tools = withWriteTransactions(this.connection, ctx, this.buildTools(ctx, customerId), name => SHOP_WRITE_TOOLS.has(name), txCtx => this.buildTools(txCtx, customerId));

        const result = streamText({
            model,
            ...toModelInput(messages),
            tools,
            stopWhen: stepCountIs(12),
            temperature: 0.7,
            maxOutputTokens: 1024,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const r of step.toolResults) {
                        this.logger.debug(`Tool "${r.toolName}" completed`);
                    }
                }
            },
            onError: (event) => {
                this.logger.error(`streamText error: ${event.error}`);
            },
        });

        const [text, steps, usage] = await Promise.all([result.text, result.steps, result.totalUsage]);

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let allOrders: AiChatOrder[] = [];
        let allPromotions: AiPromotion[] = [];
        let addToCartAction: AddToCartAction | undefined;
        let activeOrder: AiActiveOrder | undefined;
        let applyCouponAction: ApplyCouponAction | undefined;
        let setShippingAddressAction: SetShippingAddressAction | undefined;
        let setBillingAddressAction: SetBillingAddressAction | undefined;
        let setShippingMethodAction: SetShippingMethodAction | undefined;

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
                if (data.promotions?.length > 0) {
                    allPromotions = data.promotions;
                }
                if (data.addToCartAction) {
                    addToCartAction = data.addToCartAction;
                }
                if (data.activeOrder) {
                    activeOrder = data.activeOrder;
                }
                if (data.applyCouponAction) {
                    applyCouponAction = data.applyCouponAction;
                }
                if (data.setShippingAddressAction) {
                    setShippingAddressAction = data.setShippingAddressAction;
                }
                if (data.setBillingAddressAction) {
                    setBillingAddressAction = data.setBillingAddressAction;
                }
                if (data.setShippingMethodAction) {
                    setShippingMethodAction = data.setShippingMethodAction;
                }
            }
        }

        return {
            message: text,
            products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, MAX_CHAT_COLLECTIONS),
            addToCartAction,
            orders: allOrders.length > 0 ? allOrders : undefined,
            activeOrder,
            promotions: allPromotions.length > 0 ? allPromotions : undefined,
            applyCouponAction,
            setShippingAddressAction,
            setBillingAddressAction,
            setShippingMethodAction,
            usage: {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
            },
        };
    }
}
