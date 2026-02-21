import { Body, Controller, Post } from '@nestjs/common';
import {
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    Product,
    ProductVariant,
    Collection,
} from '@vendure/core';
import { In } from 'typeorm';
import {
    SIMILARITY_THRESHOLD,
    MAX_CHAT_PRODUCTS,
    MAX_CHAT_COLLECTIONS,
    FALLBACK_MIN_SCORE,
} from '../constants';
import { EmbeddingService } from '../services/embedding.service';
import { ProductEmbeddingService } from '../services/product-embedding.service';
import { CollectionEmbeddingService } from '../services/collection-embedding.service';

export interface AiChatRequest {
    message: string;
}

export interface AiChatProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    image: string | null;
}

export interface AiChatCollection {
    id: string;
    name: string;
    slug: string;
}

export interface AiChatResponse {
    message: string;
    products: AiChatProduct[];
    collections: AiChatCollection[];
}

/**
 * REST endpoint to talk to the AI buddy. Uses vector search (and optionally keyword search)
 * to find products and returns structured response per AGENT.md.
 */
@Controller('ai-assistant')
export class AiAssistantController {
    constructor(
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {}

    @Post('chat')
    async chat(@Body() body: AiChatRequest): Promise<AiChatResponse> {
        const ctx = await this.requestContextService.create({ apiType: 'shop' });
        const query = (body?.message ?? '').trim();
        if (!query) {
            return {
                message: 'Send a message to search for products (e.g. "gift for dad", "laptop under 50k").',
                products: [],
                collections: [],
            };
        }

        const queryEmbedding = await this.embeddingService.embed(query);

        // Product search
        let similar = await this.productEmbeddingService.findSimilar(
            ctx,
            queryEmbedding,
            MAX_CHAT_PRODUCTS,
            SIMILARITY_THRESHOLD,
        );
        if (similar.length > 0) {
            console.log(`[ai-assistant] found ${similar.length} product(s) with threshold (first pass)`);
        } else {
            console.log('[ai-assistant] 0 with threshold, trying without threshold (second pass)');
            const fallback = await this.productEmbeddingService.findSimilar(
                ctx,
                queryEmbedding,
                MAX_CHAT_PRODUCTS,
            );
            const bestScore = fallback[0]?.score ?? 0;
            if (fallback.length > 0 && bestScore >= FALLBACK_MIN_SCORE) {
                similar = fallback;
                console.log(`[ai-assistant] fallback returned ${similar.length} product(s) (best score ${bestScore.toFixed(3)})`);
            } else {
                console.log(`[ai-assistant] fallback best score ${bestScore.toFixed(3)} below ${FALLBACK_MIN_SCORE}, returning no products`);
            }
        }
        // Collection search (Vendure collections: e.g. Electronics, Sports & Outdoor)
        let similarCollections = await this.collectionEmbeddingService.findSimilar(
            ctx,
            queryEmbedding,
            MAX_CHAT_COLLECTIONS,
            SIMILARITY_THRESHOLD,
        );
        if (similarCollections.length === 0) {
            const fallbackColl = await this.collectionEmbeddingService.findSimilar(
                ctx,
                queryEmbedding,
                MAX_CHAT_COLLECTIONS,
            );
            const bestCollScore = fallbackColl[0]?.score ?? 0;
            if (fallbackColl.length > 0 && bestCollScore >= FALLBACK_MIN_SCORE) {
                similarCollections = fallbackColl;
            }
        }
        const collectionIds = similarCollections.map((s) => s.collectionId);
        const collections = await this.loadCollections(ctx, collectionIds);

        if (similar.length === 0) {
            return {
                message: 'No matching products in the catalog right now.',
                products: [],
                collections,
            };
        }

        const productIds = similar.map((s) => s.productId);
        const products = await this.loadProducts(ctx, productIds);
        const byId = new Map(products.map((p) => [String(p.id), p]));
        const ordered = productIds
            .map((id) => byId.get(String(id)))
            .filter((p): p is AiChatProduct => p != null);

        return {
            message: `Found ${ordered.length} product(s) for "${query}".`,
            products: ordered,
            collections,
        };
    }

    private async loadCollections(
        _ctx: RequestContext,
        collectionIds: number[],
    ): Promise<AiChatCollection[]> {
        if (collectionIds.length === 0) return [];
        const repo = this.connection.rawConnection.getRepository(Collection);
        const list = await repo.find({
            where: { id: In(collectionIds) },
            relations: ['translations'],
        });
        const byId = new Map(list.map((c) => [c.id, c]));
        return collectionIds
            .map((id) => byId.get(id))
            .filter((c): c is Collection => c != null)
            .map((c) => {
                const translations = (c as Collection & { translations?: { name?: string; slug?: string }[] }).translations;
                const name = translations?.[0]?.name ?? (c as { name?: string }).name ?? '';
                const slug = translations?.[0]?.slug ?? (c as { slug?: string }).slug ?? '';
                return { id: String(c.id), name: String(name), slug: String(slug) };
            });
    }

    private async loadProducts(
        _ctx: RequestContext,
        productIds: number[],
    ): Promise<AiChatProduct[]> {
        const repo = this.connection.rawConnection.getRepository(Product);
        const list = await repo.find({
            where: { id: In(productIds) },
            relations: ['variants', 'variants.productVariantPrices', 'featuredAsset', 'translations'],
        });
        const result: AiChatProduct[] = [];
        for (const p of list) {
            const translations = (p as Product & { translations?: { name?: string; slug?: string }[] }).translations;
            const name = translations?.[0]?.name ?? (p as { name?: string }).name ?? '';
            const slug = translations?.[0]?.slug ?? (p as { slug?: string }).slug ?? '';
            const variant = (p as Product & { variants?: ProductVariant[] }).variants?.[0];
            const prices = (variant as ProductVariant & { productVariantPrices?: { price: number }[] })?.productVariantPrices;
            const priceValue = prices?.[0]?.price ?? (variant as { price?: number })?.price ?? 0;
            const asset = (p as Product & { featuredAsset?: { preview?: string } }).featuredAsset;
            const image = asset?.preview ?? null;
            result.push({
                id: String(p.id),
                name: String(name),
                slug: String(slug),
                price: Number(priceValue),
                image: image ?? null,
            });
        }
        return result;
    }
}
