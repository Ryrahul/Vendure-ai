import { Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { EmbeddingService } from '../embedding.service';
import { ProductEmbeddingService } from '../product-embedding.service';
import { CollectionEmbeddingService } from '../collection-embedding.service';
import { searchTerms } from '../search-terms';
import { ChatResultMapper } from '../chat-result-mapper';
import { StorefrontApiService, type StorefrontCollection, type StorefrontProduct } from '../storefront-api.service';
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
        const collectionArg = String(args.collection ?? '').trim();
        if (!query && !collectionArg) {
            return { products: [], collections: [], summary: 'No search query provided' };
        }

        let collection: StorefrontCollection | undefined;
        if (collectionArg) {
            const found = await this.guard('collection lookup', () => this.findCollection(ctx, collectionArg));
            if (typeof found === 'object' && found && 'error' in found) return found.error;
            collection = found as StorefrontCollection | undefined;
            if (!collection) {
                return { products: [], collections: [], summary: `No collection named "${collectionArg}". Use getCollections to see the collections.` };
            }
        }

        const run = (term: string | undefined) =>
            this.guard(`search "${term ?? collection?.name}"`, () => this.storefront.search(ctx, { term, take, collectionSlug: collection?.slug }));
        let result = await run(query || undefined);
        if ('error' in result) return result.error;

        // Nothing for the words as typed: try singular forms ("computers" → "computer"), then the
        // whole collection — a keyword often just repeats the category ("footwear" in Footwear)
        // — or a collection with that name ("what do you have in computers?").
        if (!result.items.length && query) {
            const stemmed = searchTerms(query).join(' ');
            if (stemmed && stemmed !== query.toLowerCase()) {
                const retry = await run(stemmed);
                if ('error' in retry) return retry.error;
                result = retry;
            }
            if (!result.items.length && collection) {
                const inCollection = await run(undefined);
                if ('error' in inCollection) return inCollection.error;
                result = inCollection;
            } else if (!result.items.length && !collection) {
                const found = await this.guard('collection lookup', () => this.findCollection(ctx, query));
                if (found && !('error' in (found as object))) {
                    collection = found as StorefrontCollection;
                    const inCollection = await run(undefined);
                    if ('error' in inCollection) return inCollection.error;
                    result = inCollection;
                }
            }
        }

        const products = result.items.map(p => this.toChatProduct(p));
        const what = [collection ? `in the "${collection.name}" collection` : '', query && !collection ? `matching "${query}"` : '']
            .filter(Boolean)
            .join(' ');
        return {
            products,
            collections: collection ? [collection] : [],
            summary: products.length
                ? `Found ${products.length} product(s) ${what}${result.totalItems > products.length ? ` (${result.totalItems} in total)` : ''}. ${describeProducts(products)}`
                : `No products found ${what}.`,
        };
    }

    /** A collection by name or slug: exact match first, otherwise the only match. */
    private async findCollection(ctx: RequestContext, nameOrSlug: string): Promise<StorefrontCollection | undefined> {
        const matches = await this.matchCollections(ctx, nameOrSlug);
        const key = normalizeName(nameOrSlug);
        const exact = matches.find(c => normalizeName(c.name) === key || c.slug.toLowerCase() === nameOrSlug.toLowerCase());
        return exact ?? (matches.length === 1 ? matches[0] : undefined);
    }

    /**
     * Collections whose name or slug contains every meaningful word of the text, ignoring case,
     * plurals and "&" vs "and" ("home and garden" → "Home & Garden", "plants" → "Plants").
     */
    private async matchCollections(ctx: RequestContext, text: string): Promise<StorefrontCollection[]> {
        const words = searchTerms(normalizeName(text)).filter(w => !STOP_WORDS.has(w));
        if (!words.length) return [];
        const all = await this.storefront.findCollections(ctx, undefined, 100);
        return all.filter(c => {
            const haystack = `${normalizeName(c.name)} ${c.slug.toLowerCase().replace(/-/g, ' ')}`;
            return words.every(w => haystack.includes(w));
        });
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
        const result = await this.guard('collection lookup', () =>
            query ? this.matchCollections(ctx, query) : this.storefront.findCollections(ctx, undefined, 15),
        );
        if ('error' in result) {
            return result.error;
        }
        // One collection asked for ("do you sell plants?"): show some of its products right away.
        if (query && result.length === 1) {
            const inCollection = await this.guard('collection products', () =>
                this.storefront.search(ctx, { collectionSlug: result[0].slug, take: MAX_CHAT_PRODUCTS }),
            );
            if (!('error' in inCollection) && inCollection.items.length) {
                const products = inCollection.items.map(p => this.toChatProduct(p));
                return {
                    products,
                    collections: result,
                    summary:
                        `Found the "${result[0].name}" collection (${inCollection.totalItems} product(s)). Showing ${products.length}: ` +
                        describeProducts(products),
                };
            }
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

// Words that say "a category" rather than which one ("electronic products", "garden stuff").
const STOP_WORDS = new Set([
    'and', 'the', 'for', 'any', 'anything', 'some', 'something', 'all', 'your', 'you', 'have', 'sell', 'with', 'of', 'in', 'an',
    'product', 'item', 'stuff', 'thing', 'category', 'categorie', 'collection', 'range', 'section', 'department',
]);

/** Lower-case, "&" as "and", punctuation as spaces. */
function normalizeName(text: string): string {
    return text
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}
