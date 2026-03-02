import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Product, Collection } from '@vendure/core';
import { EmbeddingService } from '../embedding.service';
import { ProductEmbeddingService } from '../product-embedding.service';
import { CollectionEmbeddingService } from '../collection-embedding.service';
import { ChatResultMapper } from '../chat-result-mapper';
import { MAX_CHAT_PRODUCTS, MAX_CHAT_COLLECTIONS, SIMILARITY_THRESHOLD, FALLBACK_MIN_SCORE } from '../../constants';
import type { AiChatProduct, ToolResult } from '../types';

export class SearchTools {
    private readonly logger = new Logger(SearchTools.name);

    constructor(
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
        private mapper: ChatResultMapper,
        private fulltextSearchService: any,
    ) {}

    async searchProducts(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
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
                    image: this.mapper.resolveAssetUrl(item.productAsset?.preview ?? null),
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
            mapped = this.mapper.mapProducts(products);
        }

        return {
            products: mapped,
            collections: [],
            summary: mapped.length > 0
                ? `Found ${mapped.length} product(s) matching "${query}". The products with their variantIds are: ${mapped.map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`).join(', ')}. Products are displayed as cards in the UI — do not list them again in your text response.`
                : `No products found matching "${query}".`,
        };
    }

    async vectorSearch(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
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

        const products = similar.length > 0 ? await this.mapper.loadProductsByIds(similar.map(s => s.productId)) : [];
        const collections = similarCollections.length > 0 ? await this.mapper.loadCollectionsByIds(similarCollections.map(s => s.collectionId)) : [];

        return {
            products,
            collections,
            summary: products.length > 0
                ? `Found ${products.length} product(s) related to "${query}". The products with their variantIds are: ${products.map(p => `"${p.name}" (variantId: ${p.variantId}, price: ${p.price})`).join(', ')}. Products are displayed as cards in the UI — do not list them again in your text response.`
                : `No products found related to "${query}".`,
        };
    }

    async getCollections(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
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
        const mapped = this.mapper.mapCollections(collections);

        return {
            products: [],
            collections: mapped,
            summary: mapped.length > 0
                ? `Found ${mapped.length} collection(s)${query ? ` matching "${query}"` : ''}: ${mapped.map(c => c.name).join(', ')}.`
                : `No collections found${query ? ` matching "${query}"` : ''}.`,
        };
    }

    // todo: esma elastic search ko price range wala halne aaile hawa in memory sorting xa
    async filterByPrice(
        ctx: RequestContext,
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
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
            let candidates = result.items.map((item: any) => {
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
                    image: this.mapper.resolveAssetUrl(item.productAsset?.preview ?? null),
                    variantId: String(item.productVariantId),
                };
            });

            // Apply price filter in memory
            if (minPrice != null) {
                candidates = candidates.filter((p: any) => p.price >= minPrice);
            }
            if (maxPrice != null) {
                candidates = candidates.filter((p: any) => p.price <= maxPrice);
            }

            // Sort by price ascending and limit
            candidates.sort((a: any, b: any) => a.price - b.price);
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
            mapped = this.mapper.mapProducts(products);
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
}
