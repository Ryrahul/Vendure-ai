import { OnModuleInit } from '@nestjs/common';
import { EventBus, TransactionalConnection } from '@vendure/core';
import { EmbeddingService } from '../services/embedding.service';
import { ProductEmbeddingService } from '../services/product-embedding.service';
/**
 * Subscribes to Product created/updated/deleted and keeps ProductEmbedding in sync.
 * On create/update: load product translations, build text (name + description), embed via OpenAI, upsert.
 * On delete: remove embedding row.
 */
export declare class ProductEmbeddingHandler implements OnModuleInit {
    private eventBus;
    private connection;
    private embeddingService;
    private productEmbeddingService;
    constructor(eventBus: EventBus, connection: TransactionalConnection, embeddingService: EmbeddingService, productEmbeddingService: ProductEmbeddingService);
    onModuleInit(): void;
    private getProductId;
    private embedProduct;
}
//# sourceMappingURL=product-embedding-handler.d.ts.map