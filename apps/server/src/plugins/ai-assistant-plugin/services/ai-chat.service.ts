import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { RequestContext, TransactionalConnection, Product, ProductVariant, Collection } from '@vendure/core';
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

export interface ChatResult {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
    addToCartAction?: AddToCartAction;
}

// ──────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly and helpful shopping assistant for our online store. Your job is to help customers find products, browse collections, and answer questions about the store.

## What you CAN do:
- Help customers find products using search, semantic search, or browsing by collections
- Answer questions about products (features, prices, availability based on tool data)
- Help customers filter products by price/budget
- Recommend products based on intent (e.g. "gift for dad", "something for gaming")
- Greet customers, have polite small talk ONLY about shopping/store context
- Answer questions about the store, shipping, returns (give general helpful answers)
- Add items to the customer's cart when they ask

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
    ): Promise<ChatResult> {
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        let allProducts: AiChatProduct[] = [];
        let allCollections: AiChatCollection[] = [];
        let addToCartAction: AddToCartAction | undefined;

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

                    const toolResult = await this.executeTool(ctx, name, args);

                    if (toolResult.products.length > 0) {
                        allProducts = this.mergeProducts(allProducts, toolResult.products);
                    }
                    if (toolResult.collections.length > 0) {
                        allCollections = this.mergeCollections(allCollections, toolResult.collections);
                    }
                    if (toolResult.addToCartAction) {
                        addToCartAction = toolResult.addToCartAction;
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
                };
            }
        }

        return {
            message: 'I found some results for you. Let me know if you need anything else!',
            products: allProducts.slice(0, MAX_CHAT_PRODUCTS),
            collections: allCollections.slice(0, MAX_CHAT_COLLECTIONS),
            addToCartAction,
        };
    }

    // ──────────────────────────────────────────────
    // Tool execution
    // ──────────────────────────────────────────────

    private async executeTool(
        ctx: RequestContext,
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string; addToCartAction?: AddToCartAction }> {
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

    /**
     * filterByPrice: filter by price range
     */
    private async toolFilterByPrice(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<{ products: AiChatProduct[]; collections: AiChatCollection[]; summary: string }> {
        const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
        const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
        const query = String(args.query ?? '').trim();

        const repo = this.connection.rawConnection.getRepository(Product);
        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.productVariantPrices', 'variantPrice')
            .where('product.deletedAt IS NULL')
            .andWhere('product.enabled = :enabled', { enabled: true });

        if (query) {
            qb = qb.andWhere(
                '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term)',
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
        const mapped = this.mapProducts(products);

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

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

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
