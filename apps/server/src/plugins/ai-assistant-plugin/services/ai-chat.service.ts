import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { RequestContext, TransactionalConnection, Product, ProductVariant, Collection, OrderService, CustomerService, Order, OrderLine, isGraphQlErrorResult } from '@vendure/core';
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

export interface ChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
    orders?: AiChatOrder[];
    activeOrder?: AiActiveOrder;
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

## CRITICAL response rules for products:
- When tools return product data, do NOT list product names, prices, or images in your text. The UI automatically renders product cards with images, names, prices, and "Add to Cart" buttons below your message.
- Keep your text to a brief friendly comment like "Here are some cameras I found!" — NOT a detailed listing.
- NEVER include markdown images (![...](url)) in your response.
- NEVER list individual product names with prices. The product cards handle that.

## CRITICAL rules for addToCart:
- The variantId MUST be the EXACT numeric ID string from the product search results (e.g. "42", "15", "103"). It is always a number.
- NEVER fabricate or guess a variantId. If you don't have the exact variantId from a previous search result, search for the product first.
- Before calling addToCart, confirm with the user: mention the product name, price, and ask what quantity they want.
- Once confirmed, call addToCart with the exact variantId from the search results and the requested quantity.

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

## IMPORTANT — matching products from conversation context:
- When the user refers to a product that was ALREADY shown in the conversation (from a previous search), use the variantId you already have. Do NOT search again.
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

// ──────────────────────────────────────────────
// Tool definitions for OpenAI function calling
// ──────────────────────────────────────────────
const TOOLS: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'searchProducts',
            description: 'Search for products by keyword or product name. Returns products with their id, name, slug, price, image, and variantId.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search term or product keyword',
                    },
                    take: {
                        type: 'number',
                        description: 'Number of results to return (default 10, max 20)',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'vectorSearch',
            description: 'Semantic/intent-based product search. Returns products with their id, name, slug, price, image, and variantId. Use for vague queries like "gift for dad", "something romantic".',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The semantic search query',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'getCollections',
            description: 'Get available product collections/categories in the store.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Optional search term to filter collections.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'filterByPrice',
            description: 'Filter products by price range / budget. Prices are in the smallest currency unit (cents). "under 50 dollars" = maxPrice 5000.',
            parameters: {
                type: 'object',
                properties: {
                    minPrice: { type: 'number', description: 'Min price in cents. Optional.' },
                    maxPrice: { type: 'number', description: 'Max price in cents. Optional.' },
                    query: { type: 'string', description: 'Optional keyword to narrow results (e.g. "laptop")' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'addToCart',
            description: 'Add a product to the customer\'s shopping cart. IMPORTANT: The variantId MUST be the exact numeric ID from a previous search result (e.g. "42"). Never guess or fabricate a variantId. If you don\'t have it, search for the product first.',
            parameters: {
                type: 'object',
                properties: {
                    variantId: {
                        type: 'string',
                        description: 'The EXACT numeric variant ID from a previous search result. Must be a number like "42", never a slug or made-up string.',
                    },
                    quantity: {
                        type: 'number',
                        description: 'Quantity to add (default 1)',
                    },
                    productName: {
                        type: 'string',
                        description: 'The product name (for confirmation message)',
                    },
                },
                required: ['variantId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'getOrderHistory',
            description: 'Get the customer\'s past orders. Returns a list of orders with code, state, total, date, and items ordered. Use when customer asks about their order history or past purchases.',
            parameters: {
                type: 'object',
                properties: {
                    take: {
                        type: 'number',
                        description: 'Max number of orders to return (default 5, max 10)',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'trackOrder',
            description: 'Get the status and tracking information for a specific order. Returns order state, fulfillment status, tracking code, and items. Use when customer asks about the status of an order or wants tracking info.',
            parameters: {
                type: 'object',
                properties: {
                    orderId: {
                        type: 'string',
                        description: 'The order ID (numeric)',
                    },
                    orderCode: {
                        type: 'string',
                        description: 'The order code (e.g. "A1B2C3D4")',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'getActiveOrder',
            description: 'Get the customer\'s current shopping cart (active order). Returns all line items with product names, quantities, prices, and the cart total. Use when customer asks about their cart, wants to review items, or before adjusting quantities.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'adjustOrderLine',
            description: 'Adjust the quantity of an item in the customer\'s cart, or remove it. Requires the orderLineId from getActiveOrder results. Set quantity to 0 to remove the item. ALWAYS call getActiveOrder first if you do not have the orderLineId.',
            parameters: {
                type: 'object',
                properties: {
                    orderLineId: {
                        type: 'string',
                        description: 'The order line ID from getActiveOrder results (numeric)',
                    },
                    quantity: {
                        type: 'number',
                        description: 'The new absolute quantity. Set to 0 to remove the item.',
                    },
                },
                required: ['orderLineId', 'quantity'],
            },
        },
    },
];

@Injectable()
export class AiChatService implements OnModuleInit {
    private readonly logger = new Logger(AiChatService.name);
    private client: OpenAI;
    private fulltextSearchService: any; // Resolved at runtime from DefaultSearchPlugin's module

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private orderService: OrderService,
        private customerService: CustomerService,
    ) {
        this.client = new OpenAI({ apiKey: options.openaiApiKey });
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
    }

    /**
     * Main chat method: takes user message + conversation history,
     * runs LLM with tool calling, executes tools, returns structured response.
     */
    async chat(
        ctx: RequestContext,
        userMessage: string,
        conversationHistory: ChatCompletionMessageParam[] = [],
        customerId?: string | number,
    ): Promise<ChatResult> {
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let allOrders: AiChatOrder[] = [];
        let addToCartAction: AddToCartAction | undefined;
        let activeOrder: AiActiveOrder | undefined;

        let maxIterations = 5;
        let response = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 1024,
        });

        while (maxIterations > 0) {
            const choice = response.choices[0];
            if (!choice) break;

            const msg = choice.message;

            if (msg.tool_calls && msg.tool_calls.length > 0) {
                messages.push(msg);

                for (const toolCall of msg.tool_calls) {
                    if (toolCall.type !== 'function') {
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ error: 'Unsupported tool call type' }),
                        });
                        continue;
                    }
                    const { name, arguments: argsStr } = toolCall.function;
                    let args: Record<string, unknown> = {};
                    try {
                        args = JSON.parse(argsStr);
                    } catch {
                        this.logger.warn(`Failed to parse tool args: ${argsStr}`);
                    }

                    this.logger.log(`Tool call: ${name}(${JSON.stringify(args)})`);

                    const toolResult = await this.executeTool(ctx, name, args, customerId);

                    if (toolResult.products.length > 0) {
                        allProducts = this.mergeProducts(allProducts, toolResult.products);
                    }
                    if (toolResult.collections.length > 0) {
                        allCollections = this.mergeCollections(allCollections, toolResult.collections);
                    }
                    if (toolResult.orders && toolResult.orders.length > 0) {
                        allOrders = toolResult.orders;
                    }
                    if (toolResult.addToCartAction) {
                        addToCartAction = toolResult.addToCartAction;
                    }
                    if (toolResult.activeOrder) {
                        activeOrder = toolResult.activeOrder;
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(toolResult),
                    });
                }

                response = await this.client.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages,
                    tools: TOOLS,
                    tool_choice: 'auto',
                    temperature: 0.7,
                    max_tokens: 1024,
                });

                maxIterations--;
            } else {
                return {
                    message: msg.content ?? '',
                    products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
                    collections: allCollections.slice(0, MAX_CHAT_COLLECTIONS),
                    addToCartAction,
                    orders: allOrders.length > 0 ? allOrders : undefined,
                    activeOrder,
                };
            }
        }

        return {
            message: 'I found some results for you. Let me know if you need anything else!',
            products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, MAX_CHAT_COLLECTIONS),
            addToCartAction,
            orders: allOrders.length > 0 ? allOrders : undefined,
            activeOrder,
        };
    }

    // ──────────────────────────────────────────────
    // Tool execution
    // ──────────────────────────────────────────────

    private async executeTool(
        ctx: RequestContext,
        toolName: string,
        args: Record<string, unknown>,
        customerId?: string | number,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; addToCartAction?: AddToCartAction; orders?: AiChatOrder[]; activeOrder?: AiActiveOrder }> {
        switch (toolName) {
            case 'searchProducts':
                return this.toolSearchProducts(ctx, args);
            case 'vectorSearch':
                return this.toolVectorSearch(ctx, args);
            case 'getCollections':
                return this.toolGetCollections(ctx, args);
            case 'filterByPrice':
                return this.toolFilterByPrice(ctx, args);
            case 'addToCart':
                return this.toolAddToCart(ctx, args);
            case 'getActiveOrder':
                return this.toolGetActiveOrder(ctx, args);
            case 'adjustOrderLine':
                return this.toolAdjustOrderLine(ctx, args);
            case 'getOrderHistory':
                return this.toolGetOrderHistory(ctx, args, customerId);
            case 'trackOrder':
                return this.toolTrackOrder(ctx, args, customerId);
            default:
                return { products: [], collections: [], summary: `Unknown tool: ${toolName}` };
        }
    }

    /**
     * searchProducts: uses Vendure's FulltextSearchService (DefaultSearchPlugin)
     * — same search index as the storefront, supports full-text ranking.
     * Falls back to raw DB query if FulltextSearchService is unavailable.
     */
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
                    image: item.productAsset?.preview ?? null,
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

    /**
     * vectorSearch: semantic search
     */
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

    /**
     * getCollections: list collections
     */
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
            // Use Vendure's search index for keyword matching (supports collection names, facets, etc.)
            // Fetch a larger batch so we have enough candidates after price filtering
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
                    image: item.productAsset?.preview ?? null,
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

    /**
     * addToCart: returns an action for the frontend to execute.
     * Validates that the variantId looks like a real numeric ID.
     */
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
            ?? productName ?? 'item';

        this.logger.log(`addToCart verified: variantId=${variantId} is "${actualProductName}" (variant: ${(variant as any).translations?.[0]?.name ?? variant.id})`);

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

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    private mapOrders(orders: Order[]): AiChatOrder[] {
        return orders.map(order => {
            const lines = ((order as any).lines ?? []).map((line: any) => {
                // Try multiple paths to get the product name
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
                image: image ?? null,
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
