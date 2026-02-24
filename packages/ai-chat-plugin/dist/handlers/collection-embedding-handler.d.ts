import { OnModuleInit } from '@nestjs/common';
import { EventBus, TransactionalConnection } from '@vendure/core';
import { EmbeddingService } from '../services/embedding.service';
import { CollectionEmbeddingService } from '../services/collection-embedding.service';
/**
 * Subscribes to Collection created/updated/deleted; keeps CollectionEmbedding in sync.
 */
export declare class CollectionEmbeddingHandler implements OnModuleInit {
    private eventBus;
    private connection;
    private embeddingService;
    private collectionEmbeddingService;
    constructor(eventBus: EventBus, connection: TransactionalConnection, embeddingService: EmbeddingService, collectionEmbeddingService: CollectionEmbeddingService);
    onModuleInit(): void;
    private getCollectionId;
    private embedCollection;
}
//# sourceMappingURL=collection-embedding-handler.d.ts.map