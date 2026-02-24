import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    EventBus,
    ProductVariantEvent,
    RequestContext,
    TransactionalConnection,
    ProductVariant,
    Product,
} from '@vendure/core';
import { filter } from 'rxjs/operators';
import { EmbeddingService } from '../services/embedding.service';
import { VariantEmbeddingService } from '../services/variant-embedding.service';

/**
 * Subscribes to ProductVariant created/updated/deleted; keeps VariantEmbedding in sync.
 * Variant is the add-to-cart unit (Phase 2); embedding enables discovery by intent.
 */
@Injectable()
export class VariantEmbeddingHandler implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private variantEmbeddingService: VariantEmbeddingService,
    ) {}

    onModuleInit() {
        this.eventBus
            .ofType(ProductVariantEvent)
            .pipe(
                filter(
                    (e) =>
                        e.type === 'created' || e.type === 'updated' || e.type === 'deleted',
                ),
            )
            .subscribe((event: ProductVariantEvent) => {
                const variants = Array.isArray(event.entity) ? event.entity : [event.entity];
                if (event.type === 'deleted') {
                    for (const v of variants) {
                        const id = this.getId(v);
                        if (id != null)
                            this.variantEmbeddingService
                                .deleteByVariantId(event.ctx, id)
                                .catch((err) =>
                                    console.error(
                                        '[AiAssistantPlugin] Failed to delete variant embedding',
                                        id,
                                        err,
                                    ),
                                );
                    }
                    return;
                }
                for (const v of variants) {
                    this.embedVariant(event.ctx, v).catch((err) =>
                        console.error(
                            '[AiAssistantPlugin] Failed to embed variant',
                            v?.id,
                            err,
                        ),
                    );
                }
            });
    }

    private getId(v: ProductVariant): number | null {
        const id = v?.id;
        if (id == null) return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }

    private async embedVariant(
        ctx: RequestContext,
        variant: ProductVariant,
    ): Promise<void> {
        const variantId = this.getId(variant);
        if (variantId == null) return;

        const conn = this.connection.rawConnection;
        const variantRepo = conn.getRepository(ProductVariant);
        const v = await variantRepo.findOne({
            where: { id: variantId },
            relations: ['translations', 'product', 'product.translations'],
        });
        if (!v) return;

        const text = buildVariantText(v);
        if (!text.trim()) return;

        const embedding = await this.embeddingService.embed(text);
        await this.variantEmbeddingService.upsertEmbedding(ctx, variantId, embedding);
    }
}

function buildVariantText(variant: ProductVariant & { product?: Product }): string {
    const parts: string[] = [];
    for (const t of (variant.translations as { name?: string }[]) || []) {
        if (t?.name) parts.push(String(t.name));
    }
    const sku = (variant as { sku?: string }).sku;
    if (sku) parts.push(sku);
    if (variant.product) {
        for (const pt of (variant.product as Product & { translations?: { name?: string }[] })
            .translations || []) {
            if (pt?.name) parts.push(String(pt.name));
        }
    }
    return parts.join(' ').trim();
}
