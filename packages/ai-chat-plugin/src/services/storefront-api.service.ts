import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService, RequestContext } from '@vendure/core';

import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions } from '../constants';

/** A product as the storefront would show it, regardless of the search engine behind it. */
export interface StorefrontProduct {
    productId: string;
    productName: string;
    slug: string;
    /** First (or only) variant to add to cart. For grouped search results this is a representative variant. */
    variantId: string;
    /** Lowest price including tax, in the smallest currency unit. */
    priceWithTax: number;
    currencyCode: string;
    image: string | null;
    /** Only known when the search engine exposes it (e.g. DefaultSearchPlugin with indexStockStatus). */
    inStock?: boolean;
}

export interface StorefrontCollection {
    id: string;
    name: string;
    slug: string;
}

export interface StorefrontSearchInput {
    term?: string;
    take: number;
    skip?: number;
    collectionSlug?: string;
    /** Inclusive, smallest currency unit, tax included. Applied by the engine when supported, else in memory. */
    minPriceWithTax?: number;
    maxPriceWithTax?: number;
    sortByPrice?: 'ASC' | 'DESC';
}

interface SearchCapabilities {
    /** Engine supports `priceRangeWithTax` on SearchInput (e.g. ElasticsearchPlugin). */
    priceRangeWithTax: boolean;
    /** Engine exposes `inStock` on SearchResult (DefaultSearchPlugin, Elasticsearch). */
    inStockResult: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IN_MEMORY_SCAN = 300;

/**
 * Runs catalog queries through the store's own Shop API.
 *
 * Vendure has no engine-agnostic search service: search plugins (DefaultSearchPlugin,
 * Elasticsearch, Typesense, Meilisearch, …) each replace the Shop API `search` resolver.
 * Going through the Shop API is therefore the only way to use whichever engine the
 * store has configured, and it also applies every storefront visibility rule — channel,
 * language, currency, enabled flags, and any plugin that overrides catalog resolvers
 * (e.g. per-channel availability).
 *
 * Requests are anonymous: the assistant only ever sees what any shopper could see.
 *
 * IDs: the Shop API speaks *encoded* ids (per the configured EntityIdStrategy), while the
 * rest of the plugin (pgvector rows, cart tools) uses database ids. This service encodes
 * ids it sends and decodes ids it returns, so callers only ever deal with database ids.
 */
@Injectable()
export class StorefrontApiService {
    private readonly logger = new Logger(StorefrontApiService.name);
    private capabilities?: Promise<SearchCapabilities>;

    constructor(
        @Inject(AI_ASSISTANT_OPTIONS) private options: AiAssistantPluginOptions,
        private configService: ConfigService,
    ) {}

    /** Product search through the configured search engine. Results are grouped by product. */
    async search(ctx: RequestContext, input: StorefrontSearchInput): Promise<{ items: StorefrontProduct[]; totalItems: number }> {
        const caps = await this.getCapabilities(ctx);
        const hasPriceFilter = input.minPriceWithTax != null || input.maxPriceWithTax != null;
        const engineFiltersPrice = hasPriceFilter && caps.priceRangeWithTax;

        const baseInput: Record<string, unknown> = {
            term: input.term || undefined,
            collectionSlug: input.collectionSlug || undefined,
            groupByProduct: true,
            ...(input.sortByPrice ? { sort: { price: input.sortByPrice } } : {}),
            ...(engineFiltersPrice
                ? { priceRangeWithTax: { min: input.minPriceWithTax ?? 0, max: input.maxPriceWithTax ?? Number.MAX_SAFE_INTEGER } }
                : {}),
        };

        if (!hasPriceFilter || engineFiltersPrice) {
            const page = await this.runSearch(ctx, { ...baseInput, take: input.take, skip: input.skip ?? 0 }, caps);
            return page;
        }

        // The engine can't filter by price: scan a bounded number of results and filter in memory.
        const matches: StorefrontProduct[] = [];
        const pageSize = 100;
        for (let skip = 0; skip < MAX_IN_MEMORY_SCAN && matches.length < input.take; skip += pageSize) {
            const page = await this.runSearch(ctx, { ...baseInput, take: pageSize, skip }, caps);
            matches.push(
                ...page.items.filter(
                    p =>
                        (input.minPriceWithTax == null || p.priceWithTax >= input.minPriceWithTax) &&
                        (input.maxPriceWithTax == null || p.priceWithTax <= input.maxPriceWithTax),
                ),
            );
            if (page.items.length < pageSize) {
                break;
            }
        }
        return { items: matches.slice(0, input.take), totalItems: matches.length };
    }

    /**
     * Loads products by id as the storefront sees them. Products that are not visible
     * in the active channel (disabled, unassigned, deleted, hidden by a plugin) are
     * silently dropped. Input order is preserved.
     */
    async getProductsByIds(ctx: RequestContext, productIds: Array<string | number>): Promise<StorefrontProduct[]> {
        if (!productIds.length) {
            return [];
        }
        const ids = productIds.map(String);
        const data = await this.query<{ products: { items: any[] } }>(
            ctx,
            `query AiProductsByIds($ids: [String!]!, $take: Int!) {
                products(options: { filter: { id: { in: $ids } }, take: $take }) {
                    items {
                        id name slug
                        featuredAsset { preview }
                        variants { id priceWithTax currencyCode }
                    }
                }
            }`,
            { ids: ids.map(id => this.encodeId(id)), take: ids.length },
        );
        const byId = new Map<string, StorefrontProduct>();
        for (const p of data.products.items) {
            const variants: any[] = p.variants ?? [];
            if (!variants.length) {
                continue; // not purchasable in this channel
            }
            const cheapest = variants.reduce((a, b) => (b.priceWithTax < a.priceWithTax ? b : a));
            const productId = this.decodeId(p.id);
            byId.set(productId, {
                productId,
                productName: p.name,
                slug: p.slug,
                variantId: this.decodeId(cheapest.id),
                priceWithTax: Number(cheapest.priceWithTax),
                currencyCode: cheapest.currencyCode,
                image: p.featuredAsset?.preview ?? null,
            });
        }
        return ids.map(id => byId.get(id)).filter((p): p is StorefrontProduct => !!p);
    }

    /** Public collections, optionally filtered by name. */
    async findCollections(ctx: RequestContext, term: string | undefined, take: number): Promise<StorefrontCollection[]> {
        const filter = term ? { name: { contains: term } } : undefined;
        const data = await this.query<{ collections: { items: StorefrontCollection[] } }>(
            ctx,
            `query AiCollections($options: CollectionListOptions) {
                collections(options: $options) { items { id name slug } }
            }`,
            { options: { take, ...(filter ? { filter } : {}) } },
        );
        return data.collections.items.map(c => ({ id: this.decodeId(c.id), name: c.name, slug: c.slug }));
    }

    /** Public collections by id, preserving input order. Private/other-channel ones are dropped. */
    async getCollectionsByIds(ctx: RequestContext, collectionIds: Array<string | number>): Promise<StorefrontCollection[]> {
        if (!collectionIds.length) {
            return [];
        }
        const ids = collectionIds.map(String);
        const data = await this.query<{ collections: { items: StorefrontCollection[] } }>(
            ctx,
            `query AiCollectionsByIds($ids: [String!]!, $take: Int!) {
                collections(options: { filter: { id: { in: $ids } }, take: $take }) { items { id name slug } }
            }`,
            { ids: ids.map(id => this.encodeId(id)), take: ids.length },
        );
        const byId = new Map(
            data.collections.items.map(c => {
                const id = this.decodeId(c.id);
                return [id, { id, name: c.name, slug: c.slug }] as const;
            }),
        );
        return ids.map(id => byId.get(id)).filter((c): c is StorefrontCollection => !!c);
    }

    private async runSearch(
        ctx: RequestContext,
        input: Record<string, unknown>,
        caps: SearchCapabilities,
    ): Promise<{ items: StorefrontProduct[]; totalItems: number }> {
        const data = await this.query<{ search: { items: any[]; totalItems: number } }>(
            ctx,
            `query AiSearch($input: SearchInput!) {
                search(input: $input) {
                    totalItems
                    items {
                        productId productName slug productVariantId currencyCode
                        ${caps.inStockResult ? 'inStock' : ''}
                        productAsset { preview }
                        priceWithTax { ... on SinglePrice { value } ... on PriceRange { min } }
                    }
                }
            }`,
            { input },
        );
        return {
            totalItems: data.search.totalItems,
            items: data.search.items.map(item => ({
                productId: this.decodeId(item.productId),
                productName: item.productName,
                slug: item.slug,
                variantId: this.decodeId(item.productVariantId),
                priceWithTax: Number(item.priceWithTax?.value ?? item.priceWithTax?.min ?? 0),
                currencyCode: item.currencyCode,
                image: item.productAsset?.preview ?? null,
                ...(caps.inStockResult ? { inStock: item.inStock } : {}),
            })),
        };
    }

    /**
     * Detects optional search features once per process. Falls back to the core
     * contract (no price range, no stock flag) when introspection is disabled.
     */
    private getCapabilities(ctx: RequestContext): Promise<SearchCapabilities> {
        if (!this.capabilities) {
            this.capabilities = this.query<{ input: any; result: any }>(
                ctx,
                `query AiSearchCapabilities {
                    input: __type(name: "SearchInput") { inputFields { name } }
                    result: __type(name: "SearchResult") { fields { name } }
                }`,
            )
                .then(data => {
                    const inputFields = new Set<string>((data.input?.inputFields ?? []).map((f: any) => f.name));
                    const resultFields = new Set<string>((data.result?.fields ?? []).map((f: any) => f.name));
                    const caps = {
                        priceRangeWithTax: inputFields.has('priceRangeWithTax'),
                        inStockResult: resultFields.has('inStock'),
                    };
                    this.logger.log(`Search engine capabilities: ${JSON.stringify(caps)}`);
                    return caps;
                })
                .catch(e => {
                    this.logger.warn(`Could not introspect search capabilities (${e?.message}); using core search contract only`);
                    // Retry detection on a later request rather than caching a transient failure forever.
                    this.capabilities = undefined;
                    return { priceRangeWithTax: false, inStockResult: false };
                });
        }
        return this.capabilities;
    }

    private async query<T>(ctx: RequestContext, query: string, variables: Record<string, unknown> = {}): Promise<T> {
        const url = new URL(this.getShopApiUrl());
        url.searchParams.set('languageCode', ctx.languageCode);
        if (ctx.currencyCode) {
            url.searchParams.set('currencyCode', ctx.currencyCode);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    [this.configService.apiOptions.channelTokenKey]: ctx.channel.token,
                },
                body: JSON.stringify({ query, variables }),
                signal: controller.signal,
            });
            const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
            if (body.errors?.length) {
                throw new Error(body.errors.map(e => e.message).join('; '));
            }
            if (!body.data) {
                throw new Error(`Shop API returned HTTP ${response.status} without data`);
            }
            return body.data;
        } finally {
            clearTimeout(timeout);
        }
    }

    private get idStrategy() {
        const config = this.configService as any;
        return config.entityOptions?.entityIdStrategy ?? config.entityIdStrategy;
    }

    /** Database id → id as exposed by the GraphQL API. */
    private encodeId(id: string): string {
        const strategy = this.idStrategy;
        if (!strategy) {
            return id;
        }
        return strategy.encodeId(strategy.primaryKeyType === 'increment' ? Number(id) : id);
    }

    /** Id as exposed by the GraphQL API → database id (as a string). */
    private decodeId(id: string | number): string {
        const strategy = this.idStrategy;
        return String(strategy ? strategy.decodeId(String(id)) : id);
    }

    private getShopApiUrl(): string {
        if (this.options.shopApiUrl) {
            return this.options.shopApiUrl;
        }
        const { hostname, port, shopApiPath } = this.configService.apiOptions;
        const host = !hostname || hostname === '0.0.0.0' || hostname === '::' ? '127.0.0.1' : hostname;
        return `http://${host}:${port}/${shopApiPath}`;
    }
}
