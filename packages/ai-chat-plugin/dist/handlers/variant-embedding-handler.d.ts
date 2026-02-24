import { OnModuleInit } from '@nestjs/common';
import { EventBus, TransactionalConnection } from '@vendure/core';
import { EmbeddingService } from '../services/embedding.service';
import { VariantEmbeddingService } from '../services/variant-embedding.service';
/**
 * Subscribes to ProductVariant created/updated/deleted; keeps VariantEmbedding in sync.
 * Variant is the add-to-cart unit (Phase 2); embedding enables discovery by intent.
 */
export declare class VariantEmbeddingHandler implements OnModuleInit {
    private eventBus;
    private connection;
    private embeddingService;
    private variantEmbeddingService;
    constructor(eventBus: EventBus, connection: TransactionalConnection, embeddingService: EmbeddingService, variantEmbeddingService: VariantEmbeddingService);
    onModuleInit(): void;
    private getId;
    private embedVariant;
}
//# sourceMappingURL=variant-embedding-handler.d.ts.map