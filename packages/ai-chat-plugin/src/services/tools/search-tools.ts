import { Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { EmbeddingService } from '../embedding.service';
import { ProductEmbeddingService } from '../product-embedding.service';
import { CollectionEmbeddingService } from '../collection-embedding.service';
import { ChatResultMapper } from '../chat-result-mapper';
import { StorefrontApiService, type StorefrontProduct } from '../storefront-api.service';
import { MAX_CHAT_PRODUCTS, MAX_CHAT_COLLECTIONS, SIMILARITY_THRESHOLD, FALLBACK_MIN_SCORE, formatPrice } from '../../constants';
import type { AiChatProduct, ToolResult } from '../types';

/** Vector candidates fetched before visibility filtering, so hidden products don't starve the result. */
const VECTOR_CANDIDATE_FACTOR = 4;

/**
 * Shop search tools. Keyword search, price filtering and collection lookup go through the
 * store's Shop API (see StorefrontApiService), so they use whichever search engine is
 * configured. Semantic results come from pgvector but are hydrated through the Shop API
 * too, so a product hidden from the storefront is never suggested.
 */
export class SearchTools {
    private readonly logger = new Logger(SearchTools.name);

    constructor(
        private storefront: StorefrontApiService,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private mapper: ChatResultMapper,
    ) {}

    async searchProducts(ctx: RequestContext, args: Record<string, unknown>): Promise<ToolResult> {
        const query = String(args.query ?? '').trim();
        const take = clamp(Number(args.take) || 10, 1, 20);
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided' };
        }
        const result = await this.guard(`search "${query}"`, () => this.storefront.search(ctx, { term: query, take }));
        if ('error' in result) {
            return result.error;
        }
        const products = result.items.map(p => this.toChatProduct(p));
        return {
            products,
            collections: [],
            summary: products.length
                ? `Found ${products.length} product(s) matching "${query}". ${describeProducts(products)}`
                : `No products found matching "${query}".`,
        };
    }

    async vectorSearch(ctx: RequestContext, args: Record<string, unknown>): Promise<ToolResult> {
        const query = String(args.query ?? '').trim();
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided' };
        }
        const queryEmbedding = await this.embeddingService.embed(query);
        const candidates = MAX_CHAT_PRODUCTS * VECTOR_CANDIDATE_FACTOR;

        let similar = await this.productEmbeddingService.findSimilar(ctx, queryEmbedding, candidates, SIMILARITY_THRESHOLD);
        if (similar.length === 0) {
            const fallback = await this.productEmbeddingService.findSimilar(ctx, queryEmbedding, candidates);
            if ((fallback[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similar = fallback;
            }
        }
        let similarCollections = await this.collectionEmbeddingService.findSimilar(
            ctx, queryEmbedding, MAX_CHAT_COLLECTIONS * VECTOR_CANDIDATE_FACTOR, SIMILARITY_THRESHOLD,
        );
        if (similarCollections.length === 0) {
            const fallback = await this.collectionEmbeddingService.findSimilar(ctx, queryEmbedding, MAX_CHAT_COLLECTIONS);
            if ((fallback[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similarCollections = fallback;
            }
        }

        const hydrated = await this.guard(`semantic search "${query}"`, async () => ({
            products: await this.storefront.getProductsByIds(ctx, unique(similar.map(s => s.productId))),
            collections: await this.storefront.getCollectionsByIds(ctx, unique(similarCollections.map(s => s.collectionId))),
        }));
        if ('error' in hydrated) {
            return hydrated.error;
        }
        const products = hydrated.products.slice(0, MAX_CHAT_PRODUCTS).map(p => this.toChatProduct(p));
        const collections = hydrated.collections.slice(0, MAX_CHAT_COLLECTIONS);
        return {
            products,
            collections,
            summary: products.length
                ? `Found ${products.length} product(s) related to "${query}". ${describeProducts(products)}`
                : `No products found related to "${query}".`,
        };
    }

    async getCollections(ctx: RequestContext, args: Record<string, unknown>): Promise<ToolResult> {
        const query = String(args.query ?? '').trim();
        const result = await this.guard('collection lookup', () => this.storefront.findCollections(ctx, query || undefined, 15));
        if ('error' in result) {
            return result.error;
        }
        return {
            products: [],
            collections: result,
            summary: result.length
                ? `Found ${result.length} collection(s)${query ? ` matching "${query}"` : ''}: ${result.map(c => c.name).join(', ')}.`
                : `No collections found${query ? ` matching "${query}"` : ''}.`,
        };
    }

    async filterByPrice(ctx: RequestContext, args: Record<string, unknown>): Promise<ToolResult> {
        const minPrice = args.minPrice != null ? Number(args.minPrice) : undefined;
        const maxPrice = args.maxPrice != null ? Number(args.maxPrice) : undefined;
        const query = String(args.query ?? '').trim();

        const result = await this.guard('price search', () =>
            this.storefront.search(ctx, {
                term: query || undefined,
                take: MAX_CHAT_PRODUCTS,
                minPriceWithTax: minPrice,
                maxPriceWithTax: maxPrice,
                sortByPrice: 'ASC',
            }),
        );
        if ('error' in result) {
            return result.error;
        }
        const products = result.items.map(p => this.toChatProduct(p));
        const currency = products[0]?.currencyCode ?? ctx.currencyCode;
        const priceDesc =
            minPrice != null && maxPrice != null
                ? `between ${formatPrice(minPrice, currency)} and ${formatPrice(maxPrice, currency)}`
                : minPrice != null
                  ? `above ${formatPrice(minPrice, currency)}`
                  : maxPrice != null
                    ? `under ${formatPrice(maxPrice, currency)}`
                    : '';
        return {
            products,
            collections: [],
            summary: products.length
                ? `Found ${products.length} product(s) ${priceDesc}${query ? ` matching "${query}"` : ''}. ${describeProducts(products)}`
                : `No products found ${priceDesc}${query ? ` matching "${query}"` : ''}.`,
        };
    }

    private toChatProduct(p: StorefrontProduct): AiChatProduct {
        return {
            id: p.productId,
            name: p.productName,
            slug: p.slug,
            price: p.priceWithTax,
            currencyCode: p.currencyCode,
            image: this.mapper.resolveAssetUrl(p.image),
            variantId: p.variantId,
            ...(p.inStock !== undefined ? { inStock: p.inStock } : {}),
        };
    }

    /** Turns a Shop API failure into a tool result the model can relay, instead of an exception. */
    private async guard<T>(what: string, fn: () => Promise<T>): Promise<T | { error: ToolResult }> {
        try {
            return await fn();
        } catch (e: any) {
            this.logger.error(`Storefront ${what} failed: ${e?.message}`);
            return {
                error: {
                    products: [],
                    collections: [],
                    summary: 'Product search is temporarily unavailable. Apologise and suggest the customer try again shortly.',
                },
            };
        }
    }
}

function describeProducts(products: AiChatProduct[]): string {
    const list = products
        .map(p => {
            const stock = p.inStock === false ? ', out of stock' : '';
            return `"${p.name}" (variantId: ${p.variantId}, price: ${formatPrice(p.price, p.currencyCode)}${stock})`;
        })
        .join(', ');
    return `The products with their variantIds are: ${list}. Products are displayed as cards in the UI — do not list them again in your text response.`;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function unique<T>(items: T[]): T[] {
    return Array.from(new Set(items));
}
