import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Product } from '@vendure/core';
import { formatPrice, MAX_CHAT_PRODUCTS, SIMILARITY_THRESHOLD, FALLBACK_MIN_SCORE } from '../../constants';
import { ChatResultMapper } from '../chat-result-mapper';
import { EmbeddingService } from '../embedding.service';
import { ProductEmbeddingService } from '../product-embedding.service';
import { CollectionEmbeddingService } from '../collection-embedding.service';
import type { AiChatProduct, AiChatCollection, ToolResult } from '../types';

export class AdminProductTools {
    private readonly logger = new Logger(AdminProductTools.name);

    constructor(
        private connection: TransactionalConnection,
        private mapper: ChatResultMapper,
        private fulltextSearchService: any,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {}

    async searchProducts(
        ctx: RequestContext,
        args: { query: string; take?: number; includeDisabled?: boolean },
    ): Promise<ToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 10, 25);
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided.' };
        }

        const repo = this.connection.rawConnection.getRepository(Product);
        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.productVariantPrices', 'price')
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .where('product.deletedAt IS NULL')
            .andWhere(
                '(LOWER(translation.name) LIKE :term OR LOWER(translation.description) LIKE :term)',
                { term: `%${query.toLowerCase()}%` },
            );

        if (!args.includeDisabled) {
            qb = qb.andWhere('product.enabled = :enabled', { enabled: true });
        }

        const products = await qb.take(take).getMany();

        if (products.length === 0) {
            return { products: [], collections: [], summary: `No products found matching "${query}".` };
        }

        const mapped = this.mapper.mapProducts(products);

        // Build a rich summary with admin details the LLM can reference
        const summaryLines = products.map(p => {
            const name = (p as any).translations?.[0]?.name ?? '';
            const enabled = p.enabled ? 'Enabled' : 'DISABLED';
            const variants = ((p as any).variants ?? []) as any[];
            const totalStock = variants.reduce((sum: number, v: any) => {
                const levels = v.stockLevels ?? [];
                return sum + levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            }, 0);
            const variantCount = variants.length;
            return `"${name}" (ID: ${p.id}, ${enabled}, ${variantCount} variants, stock: ${totalStock})`;
        });

        return {
            products: mapped,
            collections: [],
            summary: `Found ${mapped.length} product(s) matching "${query}": ${summaryLines.join('; ')}. Product cards with images are shown in the UI — keep your text brief.`,
        };
    }

    async vectorSearch(
        ctx: RequestContext,
        args: { query: string },
    ): Promise<ToolResult> {
        const query = (args.query ?? '').trim();
        if (!query) {
            return { products: [], collections: [], summary: 'No search query provided.' };
        }

        const queryEmbedding = await this.embeddingService.embed(query);

        let similar = await this.productEmbeddingService.findSimilar(
            ctx, queryEmbedding, MAX_CHAT_PRODUCTS, SIMILARITY_THRESHOLD,
        );
        if (similar.length === 0) {
            const fallback = await this.productEmbeddingService.findSimilar(ctx, queryEmbedding, MAX_CHAT_PRODUCTS);
            if (fallback.length > 0 && (fallback[0]?.score ?? 0) >= FALLBACK_MIN_SCORE) {
                similar = fallback;
            }
        }

        let similarCollections = await this.collectionEmbeddingService.findSimilar(
            ctx, queryEmbedding, 3, SIMILARITY_THRESHOLD,
        );
        if (similarCollections.length === 0) {
            const fallbackColl = await this.collectionEmbeddingService.findSimilar(ctx, queryEmbedding, 3);
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
                ? `Found ${products.length} product(s) related to "${query}": ${products.map(p => `"${p.name}" (${formatPrice(p.price)})`).join(', ')}. Product cards with images are shown in the UI — keep your text brief.`
                : `No products found related to "${query}".`,
        };
    }

    async getProductDetails(
        ctx: RequestContext,
        args: { productId?: string; slug?: string },
    ): Promise<ToolResult> {
        const repo = this.connection.rawConnection.getRepository(Product);

        let qb = repo.createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translation')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('variant.productVariantPrices', 'price')
            .leftJoinAndSelect('variant.stockLevels', 'stockLevel')
            .where('product.deletedAt IS NULL');

        if (args.productId) {
            qb = qb.andWhere('product.id = :id', { id: args.productId });
        } else if (args.slug) {
            qb = qb.andWhere('translation.slug = :slug', { slug: args.slug });
        } else {
            return { products: [], collections: [], summary: 'Please provide a productId or slug.' };
        }

        const product = await qb.getOne();
        if (!product) {
            return { products: [], collections: [], summary: `Product not found.` };
        }

        const mapped = this.mapper.mapProducts([product]);
        const name = (product as any).translations?.[0]?.name ?? '';
        const description = (product as any).translations?.[0]?.description ?? '';
        const enabled = product.enabled ? 'Enabled' : 'DISABLED';
        const variants = ((product as any).variants ?? []) as any[];

        const variantSummary = variants.map((v: any) => {
            const vName = v.translations?.[0]?.name ?? '';
            const priceVal = v.productVariantPrices?.[0]?.price ?? 0;
            const sku = v.sku ?? '';
            const levels = v.stockLevels ?? [];
            const stockOnHand = levels.reduce((s: number, sl: any) => s + (sl.stockOnHand ?? 0), 0);
            return `${vName} (SKU: ${sku}, ${formatPrice(priceVal)}, stock: ${stockOnHand})`;
        }).join('; ');

        const descSnippet = description.length > 200 ? description.substring(0, 200) + '...' : description;

        return {
            products: mapped,
            collections: [],
            summary: `${name} (ID: ${product.id}, ${enabled}). ${descSnippet ? `Description: ${descSnippet}. ` : ''}Variants: ${variantSummary}. Product card with image shown in UI.`,
        };
    }
}
