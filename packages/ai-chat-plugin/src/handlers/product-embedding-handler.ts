import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus, ProductEvent, TransactionalConnection, Product } from '@vendure/core';
import { filter } from 'rxjs/operators';
import { EmbeddingService } from '../services/embedding.service';
import { ProductEmbeddingService } from '../services/product-embedding.service';

/**
 * Subscribes to Product created/updated/deleted and keeps ProductEmbedding in sync.
 * On create/update: load product translations, build text (name + description), embed via OpenAI, upsert.
 * On delete: remove embedding row.
 */
@Injectable()
export class ProductEmbeddingHandler implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
    ) {}

    onModuleInit() {
        this.eventBus
            .ofType(ProductEvent)
            .pipe(
                filter((e) => e.type === 'created' || e.type === 'updated' || e.type === 'deleted'),
            )
            .subscribe((event: ProductEvent) => {
                if (event.type === 'deleted') {
                    const productId = this.getProductId(event.entity);
                    if (productId != null) {
                        this.productEmbeddingService.deleteByProductId(event.ctx, productId).catch((err) => {
                            console.error('[AiAssistantPlugin] Failed to delete embedding for product', productId, err);
                        });
                    }
                    return;
                }
                // created | updated
                this.embedProduct(event).catch((err) => {
                    console.error('[AiAssistantPlugin] Failed to embed product', event.entity.id, err);
                });
            });
    }

    private getProductId(product: Product): number | null {
        const id = product?.id;
        if (id == null) return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }

    private async embedProduct(event: ProductEvent): Promise<void> {
        const productId = this.getProductId(event.entity);
        if (productId == null) return;

        const productRepo = this.connection.rawConnection.getRepository(Product);
        const product = await productRepo.findOne({
            where: { id: productId },
            relations: ['translations'],
        });
        if (!product?.translations?.length) {
            return;
        }

        const text = buildProductText(product);
        if (!text.trim()) return;

        const embedding = await this.embeddingService.embed(text);
        await this.productEmbeddingService.upsertEmbedding(event.ctx, productId, embedding);
    }
}

function buildProductText(product: Product): string {
    const parts: string[] = [];
    for (const t of product.translations || []) {
        const name = (t as { name?: string }).name;
        const description = (t as { description?: string }).description;
        if (name) parts.push(String(name));
        if (description) parts.push(String(description));
    }
    return parts.join(' ').trim();
}
