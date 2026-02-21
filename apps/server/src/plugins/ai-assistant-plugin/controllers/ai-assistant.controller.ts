import { Body, Controller, Post } from '@nestjs/common';
import {
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    Product,
    ProductVariant,
} from '@vendure/core';
import { In } from 'typeorm';
import { SIMILARITY_THRESHOLD, MAX_CHAT_PRODUCTS } from '../constants';
import { EmbeddingService } from '../services/embedding.service';
import { ProductEmbeddingService } from '../services/product-embedding.service';

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

export interface AiChatResponse {
    message: string;
    products: AiChatProduct[];
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
    ) {}

    @Post('chat')
    async chat(@Body() body: AiChatRequest): Promise<AiChatResponse> {
        const ctx = await this.requestContextService.create({ apiType: 'shop' });
        const query = (body?.message ?? '').trim();
        if (!query) {
            return { message: 'Send a message to search for products (e.g. "gift for dad", "laptop under 50k").', products: [] };
        }

        const similar = await this.productEmbeddingService.findSimilar(
            ctx,
            await this.embeddingService.embed(query),
            MAX_CHAT_PRODUCTS,
            SIMILARITY_THRESHOLD,
        );
        console.log('similar', similar);
        if (similar.length === 0) {
            return {
                message: 'No matching products in the catalog right now.',
                products: [],
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
        };
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
