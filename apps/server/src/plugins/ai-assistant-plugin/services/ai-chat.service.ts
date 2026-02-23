import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { RequestContext, TransactionalConnection, Product, ProductVariant, Collection, OrderService, CustomerService, Order, isGraphQlErrorResult, ConfigService } from '@vendure/core';
import { In } from 'typeorm';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions, MAX_CHAT_PRODUCTS, MAX_CHAT_COLLECTIONS, SIMILARITY_THRESHOLD, FALLBACK_MIN_SCORE } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';

/** Structured product returned in chat responses */
export interface AiChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
    variantId: string;
}

/** Structured collection returned in chat responses */
export interface AiChatCollection {
    id: string;
    name: string;
    slug: string;
}

/** Action signal for the frontend to execute add-to-cart */
export interface AddToCartAction {
    variantId: string;
    quantity: number;
    productName?: string;
}

/** Structured order returned in chat responses */
export interface AiChatOrder {
    id: string;
    code: string;
    state: string;
    total: number;
    orderPlacedAt: string | null;
    lines: Array<{
        productName: string;
        quantity: number;
        translations?: {
            name: string;
        }[];
    }>;
    fulfillments: Array<{
        state: string;
        method: string;
        trackingCode: string | null;
    }>;
}

/** A single line item in the active cart */
export interface AiCartLine {
    orderLineId: string;
    productName: string;
    variantId: string;
    quantity: number;
    linePriceWithTax: number;
}

/** The active order (cart) summary */
export interface AiActiveOrder {
    id: string;
    code: string;
    totalQuantity: number;
    totalWithTax: number;
    lines: AiCartLine[];
}

/** Action signal for the frontend to set shipping address */
export interface SetShippingAddressAction {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phoneNumber: string;
    company?: string;
}

/** Action signal for the frontend to set billing address */
export interface SetBillingAddressAction {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phoneNumber: string;
    company?: string;
}

/** Action signal for the frontend to set shipping method */
export interface SetShippingMethodAction {
    shippingMethodId: string;
}

export interface ChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
    orders?: AiChatOrder[];
    activeOrder?: AiActiveOrder;
    setShippingAddressAction?: SetShippingAddressAction;
    setBillingAddressAction?: SetBillingAddressAction;
    setShippingMethodAction?: SetShippingMethodAction;
}

/** Result type for streaming chat — returns a ReadableStream + structured data promise */
export interface StreamingChatResult {
    stream: ReadableStream<Uint8Array>;
    dataPromise: Promise<Omit<ChatResult, 'message'>>;
}

// ──────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly and helpful shopping assistant for our online store. Your job is to help customers find products, browse collections, manage their cart, view order history, and track their orders.

## What you CAN do:
- Help customers find products using search, semantic search, or browsing by collections
- Answer questions about products (features, prices, availability based on tool data)
- Help customers filter products by price/budget
- Recommend products based on intent (e.g. "gift for dad", "something for gaming")
- Greet customers, have polite small talk ONLY about shopping/store context
- Answer questions about the store, shipping, returns (give general helpful answers)
- Add items to the customer's cart when they ask
- Show the customer their current cart and adjust quantities or remove items
- Show the customer their order history
- Track the status of their orders and provide fulfillment/tracking info

## What you MUST NOT do:
- Answer questions unrelated to the store (e.g. "who is Elon Musk", "capital of France", "write me a poem")
- Make up or fabricate product information - ONLY use data from tool results
- Discuss politics, celebrities, news, science, or any topic outside the store

## How to handle off-topic questions:
Politely redirect: "I'm your shopping assistant and can only help with store-related questions. Can I help you find a product instead?"

## Tool usage:
- \`searchProducts\` — keyword search (e.g. "laptop", "camera", "headphones")
- \`vectorSearch\` — intent/semantic search (e.g. "gift for dad", "something romantic")
- \`getCollections\` — list product categories/collections
- \`filterByPrice\` — filter by budget/price range
- \`addToCart\` — add a product to the customer's cart
- \`getActiveOrder\` — get the customer's current cart/active order with all line items (requires login)
- \`adjustOrderLine\` — change the quantity of an item in the cart, or remove it by setting quantity to 0 (requires login)
- \`getOrderHistory\` — show the customer's past orders (requires login)
- \`trackOrder\` — get status and tracking info for an order (requires login)
- \`getAvailableCountries\` — list countries available for shipping/billing addresses
- \`getEligibleShippingMethods\` — get available shipping methods for the active order (after address is set)
- \`setShippingAddress\` — set shipping address on the active order (requires login and active order)
- \`setBillingAddress\` — set billing address on the active order (requires login and active order)
- \`setShippingMethod\` — set shipping method on the active order (requires login and active order)

## CRITICAL response rules for products:
- When tools return product data, do NOT list product names, prices, or images in your text. The UI automatically renders product cards with images, names, prices, and "Add to Cart" buttons below your message.
- Keep your text to a brief friendly comment like "Here are some cameras I found!" — NOT a detailed listing.
- NEVER include markdown images (![...](url)) in your response.
- NEVER list individual product names with prices. The product cards handle that.

## CRITICAL rules for addToCart:
- The variantId MUST be the EXACT numeric ID string from the MOST RECENT search results for that specific product (e.g. "42", "15", "103"). It is always a number.
- NEVER fabricate or guess a variantId. If you are not 100% certain of the correct variantId, search for the product AGAIN first.
- When the user says "buy this" or "add this", look at the MOST RECENTLY shown product results. Do NOT reuse variantIds from older search results for different products.
- You may confirm ONCE: mention the product name, price, and ask about quantity. But if the user has ALREADY confirmed (said "yes", "sure", "go ahead", "do it", given a quantity, etc.), call addToCart IMMEDIATELY. NEVER ask for confirmation more than once.
- Once confirmed, call addToCart with the exact variantId AND productName from the search results and the requested quantity.
- If there is ANY ambiguity about WHICH product the user means, ASK. But if the product is clear and user said yes, just add it.
- ALWAYS provide the productName parameter when calling addToCart so the backend can verify the correct product.

## Rules for cart tools (getActiveOrder, adjustOrderLine):
- Use \`getActiveOrder\` when the customer asks about their cart, what's in their cart, cart total, or wants to review before checkout.
- Use \`adjustOrderLine\` to change quantities or remove items. You need the orderLineId from getActiveOrder results.
- When adjusting quantity, set the new absolute quantity (not a delta). To remove an item, set quantity to 0.
- Always call \`getActiveOrder\` first if you don't already have the orderLineId from the conversation context.
- When showing the cart, summarize each item: product name, quantity, and line price. Also mention the cart total.

## Rules for order tools:
- Use \`getOrderHistory\` when the customer asks about their past orders, recent purchases, or order history.
- Use \`trackOrder\` when the customer asks about a specific order's status, tracking, or shipment.
- When showing order history, summarize each order briefly: order code, status, total, and what they ordered.
- When tracking an order, mention the order state, fulfillment status, tracking code (if available), and items.
- If a customer says "where's my order?" or "track my order" without specifying which one, use getOrderHistory first to find their most recent order, then use trackOrder on that order.

## Rules for checkout tools:
- **IMPORTANT — Country codes:** ALWAYS call \`getAvailableCountries\` FIRST before setting any address. Only use country codes returned by that tool. If the customer gives a country name or code not in the list, tell them which countries are available and ask them to pick one. NEVER guess or assume a country code — the backend will reject invalid ones.
- Use \`setShippingAddress\` when the customer provides their shipping address. Collect all required fields: fullName, streetLine1, city, province, postalCode, countryCode, phoneNumber. Ask for missing fields before calling.
- Use \`setBillingAddress\` when the customer provides a billing address. If they say "same as shipping", use the same address data.
- Use \`getEligibleShippingMethods\` after the shipping address is set to show available shipping options.
- Use \`setShippingMethod\` with the id from getEligibleShippingMethods when the customer chooses a shipping option.
- You CANNOT process payments. After shipping address, billing address, and shipping method are all set, tell the customer: "Everything is set! Please head to the [checkout page](/checkout) to complete your payment." Do NOT attempt to handle payment in the chat.
- Always ensure there is an active order before calling checkout tools. If no active order exists, suggest adding items first.
- The typical checkout flow is: getAvailableCountries → set shipping address → (optionally) set billing address → get eligible shipping methods → set shipping method → direct user to /checkout for payment.

## IMPORTANT — matching products from conversation context:
- When the user refers to a product that was ALREADY shown in the MOST RECENT search results, use the variantId from that specific search. Do NOT reuse variantIds from older/different searches.
- If the user switches topics to a different product, ALWAYS search again to get the correct variantId for the new product. Do NOT mix up variantIds between different products.
- Users will often use partial names, abbreviations, or slightly different wording. For example:
  - "the wooden desk" → matches "Wooden Side Desk"
  - "add the camera" → if only one camera was shown, use that one
  - "the first one" → use the first product from the last search
  - "that laptop" → matches the laptop shown earlier
- Be smart about fuzzy matching. If the user's reference clearly maps to a product already in the conversation, just use it. Only search again if you genuinely cannot tell which product they mean.

## Response style:
- Be concise and helpful
- Keep product-related messages SHORT since product cards are shown separately
- Always be honest - if something isn't available, say so`;

// Tool definitions are created inline in the chat/streamChat methods using Vercel AI SDK tool() + zod schemas

@Injectable()
export class AiChatService implements OnModuleInit {
    private readonly logger = new Logger(AiChatService.name);
    private openai: ReturnType<typeof createOpenAI>;
    private fulltextSearchService: any; // Resolved at runtime from DefaultSearchPlugin's module
    private assetUrlPrefix: string = '';

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
    ) {
        this.openai = createOpenAI({ apiKey: options.openaiApiKey });
    }

    async onModuleInit() {
        try {
            // Dynamically resolve FulltextSearchService from DefaultSearchPlugin's module
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require('@vendure/core/dist/plugin/default-search-plugin/fulltext-search.service');
            this.fulltextSearchService = this.moduleRef.get(mod.FulltextSearchService, { strict: false });
            this.logger.log('FulltextSearchService resolved successfully');
        } catch (e) {
            this.logger.warn('FulltextSearchService not available, falling back to DB queries for search');
        }

        // Build asset URL prefix from Vendure server config
        try {
            const { apiOptions } = this.configService;
            const hostname = apiOptions.hostname || 'localhost';
            const port = apiOptions.port || 3000;
            // AssetServerPlugin uses 'assets' as the route by default
            this.assetUrlPrefix = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/assets/`;
            this.logger.log(`Asset URL prefix resolved: ${this.assetUrlPrefix}`);
        } catch (e) {
            this.assetUrlPrefix = 'http://localhost:3000/assets/';
            this.logger.warn(`Could not resolve asset URL prefix, using default: ${this.assetUrlPrefix}`);
        }
    }

 
    private resolveAssetUrl(previewPath: string | null): string | null {
        if (!previewPath) return null;
        if (previewPath.startsWith('http://') || previewPath.startsWith('https://')) {
            return previewPath;
        }
        return `${this.assetUrlPrefix}${previewPath.replace(/^\//, '')}`;
    }


    private buildTools(ctx: RequestContext, customerId?: string | number): ToolSet {
        return {
            searchProducts: tool({
                description: 'Search for products by keyword or product name. Returns products with their id, name, slug, price, image, and variantId.',
                inputSchema: z.object({
                    query: z.string().describe('The search term or product keyword'),
                    take: z.number().optional().describe('Number of results to return (default 10, max 20)'),
                }),
                execute: async ({ query, take }) => this.toolSearchProducts(ctx, { query, take }),
            }),
            vectorSearch: tool({
                description: 'Semantic/intent-based product search. Use for vague queries like "gift for dad", "something romantic".',
                inputSchema: z.object({
                    query: z.string().describe('The semantic search query'),
                }),
                execute: async ({ query }) => this.toolVectorSearch(ctx, { query }),
            }),
            getCollections: tool({
                description: 'Get available product collections/categories in the store.',
                inputSchema: z.object({
                    query: z.string().optional().describe('Optional search term to filter collections'),
                }),
                execute: async ({ query }) => this.toolGetCollections(ctx, { query }),
            }),
            filterByPrice: tool({
                description: 'Filter products by price range / budget. Prices are in the smallest currency unit (cents). "under 50 dollars" = maxPrice 5000.',
                inputSchema: z.object({
                    minPrice: z.number().optional().describe('Min price in cents'),
                    maxPrice: z.number().optional().describe('Max price in cents'),
                    query: z.string().optional().describe('Optional keyword to narrow results (e.g. "laptop")'),
                }),
                execute: async ({ minPrice, maxPrice, query }) => this.toolFilterByPrice(ctx, { minPrice, maxPrice, query }),
            }),
            addToCart: tool({
                description: 'Add a product to the customer\'s shopping cart. The variantId MUST be the exact numeric ID from a previous search result. Never guess or fabricate a variantId.',
                inputSchema: z.object({
                    variantId: z.string().describe('The EXACT numeric variant ID from a previous search result'),
                    quantity: z.number().optional().describe('Quantity to add (default 1)'),
                    productName: z.string().optional().describe('The product name (for confirmation)'),
                }),
                execute: async ({ variantId, quantity, productName }) => this.toolAddToCart(ctx, { variantId, quantity, productName }),
            }),
            getActiveOrder: tool({
                description: 'Get the customer\'s current shopping cart (active order). Returns all line items with product names, quantities, prices, and the cart total.',
                inputSchema: z.object({}),
                execute: async () => this.toolGetActiveOrder(ctx, {}),
            }),
            adjustOrderLine: tool({
                description: 'Adjust the quantity of an item in the customer\'s cart, or remove it. Requires the orderLineId from getActiveOrder results. Set quantity to 0 to remove the item.',
                inputSchema: z.object({
                    orderLineId: z.string().describe('The order line ID from getActiveOrder results'),
                    quantity: z.number().describe('The new absolute quantity. Set to 0 to remove.'),
                }),
                execute: async ({ orderLineId, quantity }) => this.toolAdjustOrderLine(ctx, { orderLineId, quantity }),
            }),
            getOrderHistory: tool({
                description: 'Get the customer\'s past orders. Returns a list of orders with code, state, total, date, and items ordered.',
                inputSchema: z.object({
                    take: z.number().optional().describe('Max number of orders to return (default 5, max 10)'),
                }),
                execute: async ({ take }) => this.toolGetOrderHistory(ctx, { take }, customerId),
            }),
            trackOrder: tool({
                description: 'Get the status and tracking information for a specific order.',
                inputSchema: z.object({
                    orderId: z.string().optional().describe('The order ID (numeric)'),
                    orderCode: z.string().optional().describe('The order code (e.g. "A1B2C3D4")'),
                }),
                execute: async ({ orderId, orderCode }) => this.toolTrackOrder(ctx, { orderId, orderCode }, customerId),
            }),
            getAvailableCountries: tool({
                description: 'List countries available for shipping/billing addresses.',
                inputSchema: z.object({}),
                execute: async () => this.toolGetAvailableCountries(ctx),
            }),
            getEligibleShippingMethods: tool({
                description: 'Get available shipping methods for the active order. Call after the shipping address has been set.',
                inputSchema: z.object({}),
                execute: async () => this.toolGetEligibleShippingMethods(ctx),
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
                execute: async (params) => this.toolSetShippingAddress(ctx, params),
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
                execute: async (params) => this.toolSetBillingAddress(ctx, params),
            }),
            setShippingMethod: tool({
                description: 'Set the chosen shipping method on the active order. Use the id from getEligibleShippingMethods.',
                inputSchema: z.object({
                    shippingMethodId: z.string().describe('The shipping method ID from getEligibleShippingMethods'),
                }),
                execute: async ({ shippingMethodId }) => this.toolSetShippingMethod(ctx, { shippingMethodId }),
            }),

        };
    }

  
    streamChat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        customerId?: string | number,
    ) {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        const tools = this.buildTools(ctx, customerId);

        return streamText({
            model: this.openai('gpt-4o-mini'),
            messages,
            tools,
            stopWhen: stepCountIs(5),
            temperature: 0.7,
            maxOutputTokens: 1024,
            onStepFinish: (step) => {
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const result of step.toolResults) {
                        this.logger.log(`Tool "${result.toolName}" completed`);
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
        const result = this.streamChat(ctx, userMessage, conversationHistory, customerId);

        const text = await result.text;
        const steps = await result.steps;

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let allOrders: AiChatOrder[] = [];
        let addToCartAction: AddToCartAction | undefined;
        let activeOrder: AiActiveOrder | undefined;
        let setShippingAddressAction: SetShippingAddressAction | undefined;
        let setBillingAddressAction: SetBillingAddressAction | undefined;
        let setShippingMethodAction: SetShippingMethodAction | undefined;

        for (const step of steps) {
            for (const toolResult of step.toolResults) {
                const data = (toolResult as any).output ?? (toolResult as any).result;
                if (!data) continue;

                if (data.products?.length > 0) {
                    allProducts = this.mergeProducts(allProducts, data.products);
                }
                if (data.collections?.length > 0) {
                    allCollections = this.mergeCollections(allCollections, data.collections);
                }
                if (data.orders?.length > 0) {
                    allOrders = data.orders;
                }
                if (data.addToCartAction) {
                    addToCartAction = data.addToCartAction;
                }
                if (data.activeOrder) {
                    activeOrder = data.activeOrder;
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
            setShippingAddressAction,
            setBillingAddressAction,
            setShippingMethodAction,
        };
    }


    private async toolSearchProducts(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        const query = String(args.query ?? '').trim();
        const take = Math.min(Number(args.take) || 10, 20);
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided' };
        }

        let mapped: AiChatProduct[];

        if (this.fulltextSearchService) {
            // Use Vendure's search index (same as storefront)
            const result = await this.fulltextSearchService.search(ctx, {
                term: query,
                take,
                skip: 0,
                groupByProduct: true,
            }, true);

            this.logger.log(`FulltextSearch returned ${result.items.length} items for "${query}": ${result.items.map((i: any) => `${i.productName}(pid:${i.productId},vid:${i.productVariantId})`).join(', ')}`);
            mapped = result.items.map((item: any) => {
                const price = item.price && 'value' in item.price
                    ? item.price.value
                    : item.price && 'min' in item.price
                        ? item.price.min
                        : 0;
                return {
                    id: String(item.productId),
                    name: String(item.productName ?? ''),
                    slug: String(item.slug ?? ''),
                    price: Number(price),
                    image: this.resolveAssetUrl(item.productAsset?.preview ?? null),
                    variantId: String(item.productVariantId),
                };
            });
        } else {
            // Fallback: raw DB query
            const repo = this.connection.rawConnection.getRepository(Product);
            const products = await repo.createQueryBuilder('product')
                .leftJoinAndSelect('product.translations', 'translation')
                .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
                .leftJoinAndSelect('product.variants', 'variant')
                .leftJoinAndSelect('variant.productVariantPrices', 'price')
                .where('product.deletedAt IS NULL')
                .andWhere('product.enabled = :enabled', { enabled: true })
                .andWhere(
                    '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term)',
                    { term: `%${query.toLowerCase()}%` },
                )
                .take(take)
                .getMany();
            mapped = this.mapProducts(products);
        }

        return {
            products: mapped,
            collections: [],
            summary: mapped.length > 0
                ? `Found ${mapped.length} product(s) matching "${query}". The products with their variantIds are: ${mapped.map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`).join(', ')}. Products are displayed as cards in the UI — do not list them again in your text response.`
                : `No products found matching "${query}".`,
        };
    }

  
    private async toolVectorSearch(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        const query = String(args.query ?? '').trim();
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided' };
        }

        const queryEmbedding = await this.embeddingService.embed(query);

        let similar = await this.productEmbeddingService.findSimilar(
            ctx, queryEmbedding, MAX_CHAT_PRODUCTS, SIMILARITY_THRESHOLD,
        );
        if (similar.length === 0) {
            const fallback = await this.productEmbeddingService.findSimilar(
                ctx, queryEmbedding, MAX_CHAT_PRODUCTS,
            );
            if (fallback.length > 0 && (fallback[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similar = fallback;
            }
        }

        let similarCollections = await this.collectionEmbeddingService.findSimilar(
            ctx, queryEmbedding, MAX_CHAT_COLLECTIONS, SIMILARITY_THRESHOLD,
        );
        if (similarCollections.length === 0) {
            const fallbackColl = await this.collectionEmbeddingService.findSimilar(
                ctx, queryEmbedding, MAX_CHAT_COLLECTIONS,
            );
            if (fallbackColl.length > 0 && (fallbackColl[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similarCollections = fallbackColl;
            }
        }

        const products = similar.length > 0 ? await this.loadProductsByIds(similar.map(s => s.productId)) : [];
        const collections = similarCollections.length > 0 ? await this.loadCollectionsByIds(similarCollections.map(s => s.collectionId)) : [];

        return {
            products,
            collections,
            summary: products.length > 0
                ? `Found ${products.length} product(s) related to "${query}". The products with their variantIds are: ${products.map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`).join(', ')}. Products are displayed as cards in the UI — do not list them again in your text response.`
                : `No products found related to "${query}".`,
        };
    }

  
    private async toolGetCollections(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        const query = String(args.query ?? '').trim();
        const repo = this.connection.rawConnection.getRepository(Collection);

        let qb = repo.createQueryBuilder('collection')
            .leftJoinAndSelect('collection.translations', 'translation')
            .where('collection.isPrivate = :isPrivate', { isPrivate: false })
            .andWhere('collection.isRoot = :isRoot', { isRoot: false });

        if (query) {
            qb = qb.andWhere('LOWER(translation.name) LIKE :term', { term: `%${query.toLowerCase()}%` });
        }

        const collections = await qb.take(15).getMany();
        const mapped = this.mapCollections(collections);

        return {
            products: [],
            collections: mapped,
            summary: mapped.length > 0
                ? `Found ${mapped.length} collection(s)${query ? ` matching "${query}"` : ''}: ${mapped.map(c => c.name).join(', ')}.`
                : `No collections found${query ? ` matching "${query}"` : ''}.`,
        };
    }

// todo: esma elastic search ko price range wala halne aaile hawa in memory sorting xa
    private async toolFilterByPrice(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
        const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
        const query = String(args.query ?? '').trim();

        let mapped: AiChatProduct[];

        if (query && this.fulltextSearchService) {
           
            const fetchSize = 50;
            const result = await this.fulltextSearchService.search(ctx, {
                term: query,
                take: fetchSize,
                skip: 0,
                groupByProduct: true,
            }, true);

            this.logger.log(`filterByPrice: FulltextSearch returned ${result.items.length} items for "${query}"`);

            // Map results and extract price
            let candidates: AiChatProduct[] = result.items.map((item: any) => {
                const price = item.price && 'value' in item.price
                    ? item.price.value
                    : item.price && 'min' in item.price
                        ? item.price.min
                        : 0;
                return {
                    id: String(item.productId),
                    name: String(item.productName ?? ''),
                    slug: String(item.slug ?? ''),
                    price: Number(price),
                    image: this.resolveAssetUrl(item.productAsset?.preview ?? null),
                    variantId: String(item.productVariantId),
                };
            });

            // Apply price filter in memory
            if (minPrice != null) {
                candidates = candidates.filter(p => p.price >= minPrice);
            }
            if (maxPrice != null) {
                candidates = candidates.filter(p => p.price <= maxPrice);
            }

            // Sort by price ascending and limit
            candidates.sort((a, b) => a.price - b.price);
            mapped = candidates.slice(0, MAX_CHAT_PRODUCTS);
        } else {
            // Fallback: raw DB query (no keyword, or FulltextSearchService unavailable)
            const repo = this.connection.rawConnection.getRepository(Product);
            let qb = repo.createQueryBuilder('product')
                .leftJoinAndSelect('product.translations', 'translation')
                .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
                .leftJoinAndSelect('product.variants', 'variant')
                .leftJoinAndSelect('variant.productVariantPrices', 'variantPrice')
                .where('product.deletedAt IS NULL')
                .andWhere('product.enabled = :enabled', { enabled: true });

            if (query) {
                // Also search collection names so terms like "electronics" match
                // In Vendure, Collection ↔ ProductVariant is a many-to-many relation
                qb = qb
                    .leftJoin('variant.collections', 'collection')
                    .leftJoin('collection.translations', 'collectionTranslation')
                    .andWhere(
                        '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term OR LOWER(collectionTranslation.name) LIKE :term)',
                        { term: `%${query.toLowerCase()}%` },
                    );
            }
            if (minPrice != null && maxPrice != null) {
                qb = qb.andWhere('variantPrice.price BETWEEN :minPrice AND :maxPrice', { minPrice, maxPrice });
            } else if (minPrice != null) {
                qb = qb.andWhere('variantPrice.price >= :minPrice', { minPrice });
            } else if (maxPrice != null) {
                qb = qb.andWhere('variantPrice.price <= :maxPrice', { maxPrice });
            }

            qb = qb.orderBy('variantPrice.price', 'ASC').take(MAX_CHAT_PRODUCTS);
            const products = await qb.getMany();
            mapped = this.mapProducts(products);
        }

        const priceDesc = minPrice != null && maxPrice != null
            ? `between ${minPrice} and ${maxPrice}`
            : minPrice != null ? `above ${minPrice}` : maxPrice != null ? `under ${maxPrice}` : '';

        return {
            products: mapped,
            collections: [],
            summary: mapped.length > 0
                ? `Found ${mapped.length} product(s) ${priceDesc}${query ? ` matching "${query}"` : ''}. The products with their variantIds are: ${mapped.map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`).join(', ')}. Products are displayed as cards in the UI — do not list them again in your text response.`
                : `No products found ${priceDesc}${query ? ` matching "${query}"` : ''}.`,
        };
    }

  
    private async toolAddToCart(
        _ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; addToCartAction?: AddToCartAction }> {
        const variantId = String(args.variantId ?? '').trim();
        const quantity = Math.max(1, Number(args.quantity) || 1);
        const productName = args.productName ? String(args.productName) : undefined;

        this.logger.log(`addToCart called with variantId=${variantId}, quantity=${quantity}, productName=${productName}`);

        if (!variantId) {
            return { products: [], collections: [], summary: 'Error: No variantId provided. Search for the product first to get the correct variantId.' };
        }

        // Validate that variantId is a numeric ID, not a fabricated slug
        if (!/^\d+$/.test(variantId)) {
            return {
                products: [],
                collections: [],
                summary: `Error: Invalid variantId "${variantId}". The variantId must be a numeric ID (e.g. "42") from a previous search result. Please search for the product first to get the correct variantId.`,
            };
        }

        // Verify the variant actually exists and get the real product name
        const variantRepo = this.connection.rawConnection.getRepository(ProductVariant);
        const variant = await variantRepo.findOne({
            where: { id: Number(variantId) },
            relations: ['product', 'product.translations', 'translations'],
        });

        if (!variant) {
            return {
                products: [],
                collections: [],
                summary: `Error: No product variant found with ID ${variantId}. Please search for the product again to get the correct variantId.`,
            };
        }

        const actualProductName = (variant as any).product?.translations?.[0]?.name
            ?? (variant as any).translations?.[0]?.name
            ?? 'item';

        this.logger.log(`addToCart verified: variantId=${variantId} is "${actualProductName}" (variant: ${(variant as any).translations?.[0]?.name ?? variant.id}), LLM said productName="${productName}"`);

        // Safety check: if the LLM provided a productName, verify it roughly matches the actual product
        if (productName && actualProductName !== 'item') {
            const requestedLower = productName.toLowerCase().trim();
            const actualLower = actualProductName.toLowerCase().trim();
            // Check if neither name contains the other (very loose match)
            const isMatch = actualLower.includes(requestedLower)
                || requestedLower.includes(actualLower)
                || actualLower.split(/\s+/).some((w: string) => requestedLower.includes(w))
                || requestedLower.split(/\s+/).some((w: string) => actualLower.includes(w));

            if (!isMatch) {
                this.logger.warn(`addToCart MISMATCH: LLM requested "${productName}" but variantId ${variantId} is "${actualProductName}". Rejecting.`);
                return {
                    products: [],
                    collections: [],
                    summary: `Error: The variantId ${variantId} corresponds to "${actualProductName}", but you are trying to add "${productName}". These don't match. Please search for "${productName}" first to get the correct variantId.`,
                };
            }
        }

        return {
            products: [],
            collections: [],
            summary: `Adding ${quantity}x "${actualProductName}" (variantId: ${variantId}) to cart.`,
            addToCartAction: { variantId, quantity, productName: actualProductName },
        };
    }

    private async toolGetActiveOrder(
        ctx: RequestContext,
        _args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; activeOrder?: AiActiveOrder }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view your cart.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);

            if (!order) {
                return { products: [], collections: [], summary: 'Your cart is empty. No active order found.' };
            }

            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const fullOrder = await orderRepo.findOne({
                where: { id: order.id },
                relations: ['lines', 'lines.productVariant', 'lines.productVariant.translations', 'lines.featuredAsset'],
            });

            if (!fullOrder || !fullOrder.lines || fullOrder.lines.length === 0) {
                return { products: [], collections: [], summary: 'Your cart is empty.' };
            }

            const activeOrder = this.mapActiveOrder(fullOrder);

            const linesSummary = activeOrder.lines
                .map(l => `${l.quantity}x "${l.productName}" (orderLineId: ${l.orderLineId}, variantId: ${l.variantId}, linePrice: ${l.linePriceWithTax})`)
                .join(', ');

            return {
                products: [],
                collections: [],
                activeOrder,
                summary: `Cart has ${activeOrder.totalQuantity} item(s), total: ${activeOrder.totalWithTax}. Lines: ${linesSummary}. Use the orderLineId when adjusting quantities.`,
            };
        } catch (e) {
            this.logger.error(`Error fetching active order: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching your cart. Please try again.' };
        }
    }

   
    private async toolAdjustOrderLine(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; activeOrder?: AiActiveOrder }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to modify your cart.' };
        }

        const orderLineId = String(args.orderLineId ?? '').trim();
        const quantity = Number(args.quantity ?? -1);

        if (!orderLineId || !/^\d+$/.test(orderLineId)) {
            return { products: [], collections: [], summary: 'Error: Invalid orderLineId. Use getActiveOrder first to get the correct orderLineId.' };
        }
        if (quantity < 0) {
            return { products: [], collections: [], summary: 'Error: quantity must be 0 or greater. Set to 0 to remove the item.' };
        }

        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Your cart is empty.' };
            }

            let result;
            if (quantity === 0) {
                result = await this.orderService.removeItemFromOrder(ctx, order.id, Number(orderLineId));
            } else {
                result = await this.orderService.adjustOrderLine(ctx, order.id, Number(orderLineId), quantity);
            }

            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? (result as any).errorCode ?? 'Unknown error';
                this.logger.warn(`adjustOrderLine error: ${errorMsg}`);
                return { products: [], collections: [], summary: `Error adjusting cart: ${errorMsg}` };
            }

            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const fullOrder = await orderRepo.findOne({
                where: { id: order.id },
                relations: ['lines', 'lines.productVariant', 'lines.productVariant.translations', 'lines.featuredAsset'],
            });

            if (!fullOrder || !fullOrder.lines || fullOrder.lines.length === 0) {
                return {
                    products: [],
                    collections: [],
                    activeOrder: { id: String(order.id), code: order.code, totalQuantity: 0, totalWithTax: 0, lines: [] },
                    summary: quantity === 0
                        ? 'Item removed. Your cart is now empty.'
                        : 'Cart updated. Your cart is now empty.',
                };
            }

            const activeOrder = this.mapActiveOrder(fullOrder);
            const action = quantity === 0 ? 'removed' : `quantity updated to ${quantity}`;
            const linesSummary = activeOrder.lines
                .map(l => `${l.quantity}x "${l.productName}" (orderLineId: ${l.orderLineId})`)
                .join(', ');

            return {
                products: [],
                collections: [],
                activeOrder,
                summary: `Item ${action}. Cart now has ${activeOrder.totalQuantity} item(s), total: ${activeOrder.totalWithTax}. Lines: ${linesSummary}`,
            };
        } catch (e) {
            this.logger.error(`Error adjusting order line: ${e}`);
            return { products: [], collections: [], summary: 'Error adjusting your cart. Please try again.' };
        }
    }

    /**
     * getOrderHistory: fetches the customer's past orders using raw query for reliable relation loading.
     */
    private async toolGetOrderHistory(
        ctx: RequestContext,
        args: Record<string, unknown>,
        customerId?: string | number,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; orders: AiChatOrder[] }> {
        if (!customerId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view order history.', orders: [] };
        }

        const take = Math.min(Number(args.take) || 5, 10);

        try {
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            const orders = await orderRepo.createQueryBuilder('order')
                .leftJoinAndSelect('order.lines', 'line')
                .leftJoinAndSelect('line.productVariant', 'variant')
                .leftJoinAndSelect('variant.translations', 'variantTranslation')
                .leftJoinAndSelect('order.fulfillments', 'fulfillment')
                .where('order.customerId = :customerId', { customerId })
                .andWhere('order.active = :active', { active: false })
                .orderBy('order.orderPlacedAt', 'DESC')
                .take(take)
                .getMany();

            const mapped = this.mapOrders(orders);

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: mapped.length > 0
                    ? `Found ${mapped.length} order(s). ${mapped.map(o => `Order ${o.code}: ${o.state}, total ${o.total}, placed ${o.orderPlacedAt ?? 'N/A'}, items: ${o.lines.map(l => `${l.quantity}x ${l.productName}`).join(', ')}`).join(' | ')}`
                    : 'No past orders found.',
            };
        } catch (e) {
            this.logger.error(`Error fetching order history: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching order history. Please try again.', orders: [] };
        }
    }

    private async toolTrackOrder(
        ctx: RequestContext,
        args: Record<string, unknown>,
        customerId?: string | number,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; orders: AiChatOrder[] }> {
        if (!customerId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to track orders.', orders: [] };
        }

        const orderId = args.orderId ? String(args.orderId).trim() : undefined;
        const orderCode = args.orderCode ? String(args.orderCode).trim() : undefined;

        if (!orderId && !orderCode) {
            return { products: [], collections: [], summary: 'Error: Please provide an orderId or orderCode to track. You can use getOrderHistory first to find your orders.', orders: [] };
        }

        try {
            const orderRepo = this.connection.rawConnection.getRepository(Order);
            let qb = orderRepo.createQueryBuilder('order')
                .leftJoinAndSelect('order.lines', 'line')
                .leftJoinAndSelect('line.productVariant', 'variant')
                .leftJoinAndSelect('variant.translations', 'variantTranslation')
                .leftJoinAndSelect('order.fulfillments', 'fulfillment')
                .where('order.customerId = :customerId', { customerId });

            if (orderId) {
                qb = qb.andWhere('order.id = :orderId', { orderId });
            } else if (orderCode) {
                qb = qb.andWhere('order.code = :orderCode', { orderCode });
            }

            const order = await qb.getOne();

            if (!order) {
                return { products: [], collections: [], summary: `No order found with ${orderId ? `ID ${orderId}` : `code "${orderCode}"`}.`, orders: [] };
            }

            const mapped = this.mapOrders([order]);

            const o = mapped[0];
            const fulfillmentInfo = o.fulfillments.length > 0
                ? o.fulfillments.map(f => `${f.state}${f.trackingCode ? ` (tracking: ${f.trackingCode})` : ''} via ${f.method}`).join(', ')
                : 'No fulfillment yet';

            return {
                products: [],
                collections: [],
                orders: mapped,
                summary: `Order ${o.code}: State: ${o.state}, Total: ${o.total}, Placed: ${o.orderPlacedAt ?? 'N/A'}. Fulfillment: ${fulfillmentInfo}. Items: ${o.lines.map(l => `${l.quantity}x ${l.productName}`).join(', ')}`,
            };
        } catch (e) {
            this.logger.error(`Error tracking order: ${e}`);
            return { products: [], collections: [], summary: 'Error tracking order. Please try again.', orders: [] };
        }
    }

 
    private async toolGetAvailableCountries(
        ctx: RequestContext,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        try {
            const result = await this.connection.rawConnection.query(
                `SELECT r.id, r.code, t.name
                 FROM region r
                 JOIN region_translation t ON t."baseId" = r.id
                 WHERE r.type = 'country' AND r.enabled = true
                 ORDER BY t.name ASC`
            );
            const countries = (result as any[]).map(r => ({
                id: String(r.id),
                code: String(r.code),
                name: String(r.name),
            }));
            return {
                products: [],
                collections: [],
                summary: countries.length > 0
                    ? `Available countries: ${countries.map(c => `${c.name} (${c.code})`).join(', ')}`
                    : 'No countries available.',
            };
        } catch (e) {
            this.logger.error(`Error fetching countries: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching available countries.' };
        }
    }

    private async toolGetEligibleShippingMethods(
        ctx: RequestContext,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to view shipping methods.' };
        }
        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Add items to your cart first.' };
            }
            const methods = await this.orderService.getEligibleShippingMethods(ctx, order.id);
            const mapped = methods.map((m: any) => ({
                id: String(m.id),
                name: String(m.name ?? ''),
                code: String(m.code ?? ''),
                description: String(m.description ?? ''),
                priceWithTax: Number(m.priceWithTax ?? m.price ?? 0),
            }));
            return {
                products: [],
                collections: [],
                summary: mapped.length > 0
                    ? `Available shipping methods: ${mapped.map(m => `"${m.name}" (id: ${m.id}, price: ${m.priceWithTax}, code: ${m.code})`).join(', ')}`
                    : 'No shipping methods available. Make sure a shipping address is set first.',
            };
        } catch (e) {
            this.logger.error(`Error fetching shipping methods: ${e}`);
            return { products: [], collections: [], summary: 'Error fetching shipping methods. Make sure a shipping address has been set.' };
        }
    }

    private async toolSetShippingAddress(
        ctx: RequestContext,
        params: {
            fullName: string; streetLine1: string; streetLine2?: string;
            city: string; province: string; postalCode: string;
            countryCode: string; phoneNumber: string; company?: string;
        },
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; setShippingAddressAction?: SetShippingAddressAction }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to set a shipping address.' };
        }
        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Add items to your cart first.' };
            }
            // Validate required fields
            const required = ['fullName', 'streetLine1', 'city', 'province', 'postalCode', 'countryCode', 'phoneNumber'] as const;
            for (const field of required) {
                if (!params[field]?.trim()) {
                    return { products: [], collections: [], summary: `Error: Missing required field "${field}" for shipping address.` };
                }
            }
            // Set address via OrderService
            const result = await this.orderService.setShippingAddress(ctx, order.id, {
                fullName: params.fullName,
                streetLine1: params.streetLine1,
                streetLine2: params.streetLine2 ?? '',
                city: params.city,
                province: params.province,
                postalCode: params.postalCode,
                countryCode: params.countryCode,
                phoneNumber: params.phoneNumber,
                company: params.company ?? '',
            });
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting shipping address: ${errorMsg}` };
            }
            return {
                products: [],
                collections: [],
                summary: `Shipping address set successfully for ${params.fullName}, ${params.streetLine1}, ${params.city}, ${params.province} ${params.postalCode}, ${params.countryCode}.`,
                setShippingAddressAction: { ...params },
            };
        } catch (e) {
            this.logger.error(`Error setting shipping address: ${e}`);
            return { products: [], collections: [], summary: 'Error setting shipping address. Please try again.' };
        }
    }

    private async toolSetBillingAddress(
        ctx: RequestContext,
        params: {
            fullName: string; streetLine1: string; streetLine2?: string;
            city: string; province: string; postalCode: string;
            countryCode: string; phoneNumber: string; company?: string;
        },
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; setBillingAddressAction?: SetBillingAddressAction }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to set a billing address.' };
        }
        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Add items to your cart first.' };
            }
            const required = ['fullName', 'streetLine1', 'city', 'province', 'postalCode', 'countryCode', 'phoneNumber'] as const;
            for (const field of required) {
                if (!params[field]?.trim()) {
                    return { products: [], collections: [], summary: `Error: Missing required field "${field}" for billing address.` };
                }
            }
            const result = await this.orderService.setBillingAddress(ctx, order.id, {
                fullName: params.fullName,
                streetLine1: params.streetLine1,
                streetLine2: params.streetLine2 ?? '',
                city: params.city,
                province: params.province,
                postalCode: params.postalCode,
                countryCode: params.countryCode,
                phoneNumber: params.phoneNumber,
                company: params.company ?? '',
            });
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting billing address: ${errorMsg}` };
            }
            return {
                products: [],
                collections: [],
                summary: `Billing address set successfully for ${params.fullName}, ${params.streetLine1}, ${params.city}, ${params.province} ${params.postalCode}, ${params.countryCode}.`,
                setBillingAddressAction: { ...params },
            };
        } catch (e) {
            this.logger.error(`Error setting billing address: ${e}`);
            return { products: [], collections: [], summary: 'Error setting billing address. Please try again.' };
        }
    }

    private async toolSetShippingMethod(
        ctx: RequestContext,
        params: { shippingMethodId: string },
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; setShippingMethodAction?: SetShippingMethodAction }> {
        if (!ctx.activeUserId) {
            return { products: [], collections: [], summary: 'Error: You must be logged in to set a shipping method.' };
        }
        try {
            const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
            if (!order) {
                return { products: [], collections: [], summary: 'Error: No active order found. Add items to your cart first.' };
            }
            if (!params.shippingMethodId || !/^\d+$/.test(params.shippingMethodId)) {
                return { products: [], collections: [], summary: 'Error: Invalid shippingMethodId. Use getEligibleShippingMethods first to get valid IDs.' };
            }
            const result = await this.orderService.setShippingMethod(ctx, order.id, [params.shippingMethodId]);
            if (isGraphQlErrorResult(result)) {
                const errorMsg = (result as any).message ?? 'Unknown error';
                return { products: [], collections: [], summary: `Error setting shipping method: ${errorMsg}` };
            }
            // Get the updated order to show shipping cost
            const updatedOrder = result as Order;
            const shippingCost = (updatedOrder as any).shippingWithTax ?? (updatedOrder as any).shipping ?? 0;
            return {
                products: [],
                collections: [],
                summary: `Shipping method set successfully. Shipping cost: ${shippingCost}. Order total: ${(updatedOrder as any).totalWithTax ?? 0}.`,
                setShippingMethodAction: { shippingMethodId: params.shippingMethodId },
            };
        } catch (e) {
            this.logger.error(`Error setting shipping method: ${e}`);
            return { products: [], collections: [], summary: 'Error setting shipping method. Please try again.' };
        }
    }

    private mapOrders(orders: Order[]): AiChatOrder[] {
        return orders.map(order => {
            const lines = ((order as any).lines ?? []).map((line: any) => {
                const name = line.productVariant?.translations?.[0]?.name
                    || line.productVariant?.name
                    || 'Unknown product';
                return {
                    productName: name,
                    quantity: line.quantity ?? 0,
                };
            });

            return {
                id: String(order.id),
                code: order.code,
                state: order.state,
                total: (order as any).totalWithTax ?? (order as any).total ?? 0,
                orderPlacedAt: (order as any).orderPlacedAt ? new Date((order as any).orderPlacedAt).toISOString() : null,
                lines,
                fulfillments: ((order as any).fulfillments ?? []).map((f: any) => ({
                    state: f.state ?? 'Unknown',
                    method: f.method ?? 'Unknown',
                    trackingCode: f.trackingCode ?? null,
                })),
            };
        });
    }

    private mapActiveOrder(order: Order): AiActiveOrder {
        const lines: AiCartLine[] = ((order as any).lines ?? []).map((line: any) => {
            const name = line.productVariant?.translations?.[0]?.name
                || line.productVariant?.name
                || 'Unknown product';
            return {
                orderLineId: String(line.id),
                productName: name,
                variantId: String(line.productVariant?.id ?? ''),
                quantity: line.quantity ?? 0,
                linePriceWithTax: line.linePriceWithTax ?? line.linePrice ?? 0,
            };
        });

        return {
            id: String(order.id),
            code: order.code,
            totalQuantity: (order as any).totalQuantity ?? lines.reduce((sum: number, l: AiCartLine) => sum + l.quantity, 0),
            totalWithTax: (order as any).totalWithTax ?? 0,
            lines,
        };
    }

    private mapProducts(products: Product[]): AiChatProduct[] {
        const result: AiChatProduct[] = [];
        for (const p of products) {
            const translations = (p as Product & { translations?: { name?: string; slug?: string }[] }).translations;
            const name = translations?.[0]?.name ?? (p as { name?: string }).name ?? '';
            const slug = translations?.[0]?.slug ?? (p as { slug?: string }).slug ?? '';
            const variant = (p as Product & { variants?: ProductVariant[] }).variants?.[0];
            const prices = (variant as ProductVariant & { productVariantPrices?: { price: number }[] })?.productVariantPrices;
            const priceValue = prices?.[0]?.price ?? (variant as { price?: number })?.price ?? 0;
            const asset = (p as Product & { featuredAsset?: { preview?: string } }).featuredAsset;
            const image = asset?.preview ?? null;
            const variantId = variant ? String(variant.id) : '';
            result.push({
                id: String(p.id),
                name: String(name),
                slug: String(slug),
                price: Number(priceValue),
                image: this.resolveAssetUrl(image),
                variantId,
            });
        }
        return result;
    }

    private mapCollections(collections: Collection[]): AiChatCollection[] {
        return collections
            .filter(c => {
                const isRoot = (c as Collection & { isRoot?: boolean }).isRoot;
                if (isRoot) return false;
                const t = (c as Collection & { translations?: { name?: string; slug?: string }[] }).translations;
                const slug = t?.[0]?.slug ?? '';
                const name = t?.[0]?.name ?? '';
                if (slug.includes('__root') || name.includes('__root')) return false;
                if (!name || !slug) return false;
                return true;
            })
            .map(c => {
                const t = (c as Collection & { translations?: { name?: string; slug?: string }[] }).translations;
                return {
                    id: String(c.id),
                    name: String(t?.[0]?.name ?? ''),
                    slug: String(t?.[0]?.slug ?? ''),
                };
            });
    }

    private async loadProductsByIds(productIds: number[]): Promise<AiChatProduct[]> {
        if (productIds.length === 0) return [];
        const repo = this.connection.rawConnection.getRepository(Product);
        const list = await repo.find({
            where: { id: In(productIds) },
            relations: ['variants', 'variants.productVariantPrices', 'featuredAsset', 'translations'],
        });
        const byId = new Map(list.map(p => [p.id, p]));
        return this.mapProducts(productIds.map(id => byId.get(id)).filter((p): p is Product => p != null));
    }

    private async loadCollectionsByIds(collectionIds: number[]): Promise<AiChatCollection[]> {
        if (collectionIds.length === 0) return [];
        const repo = this.connection.rawConnection.getRepository(Collection);
        const list = await repo.find({
            where: { id: In(collectionIds) },
            relations: ['translations'],
        });
        return this.mapCollections(list);
    }

    private mergeProducts(existing: AiChatProduct[], incoming: AiChatProduct[]): AiChatProduct[] {
        const ids = new Set(existing.map(p => p.id));
        const merged = [...existing];
        for (const p of incoming) {
            if (!ids.has(p.id)) { merged.push(p); ids.add(p.id); }
        }
        return merged;
    }

    private mergeCollections(existing: AiChatCollection[], incoming: AiChatCollection[]): AiChatCollection[] {
        const ids = new Set(existing.map(c => c.id));
        const merged = [...existing];
        for (const c of incoming) {
            if (!ids.has(c.id)) { merged.push(c); ids.add(c.id); }
        }
        return merged;
    }
}
