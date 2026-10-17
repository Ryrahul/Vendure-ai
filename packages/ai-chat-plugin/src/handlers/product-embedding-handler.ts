import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus, ProductEvent } from '@vendure/core';

import { EmbeddingSyncService } from '../services/embedding-sync.service';

/**
 * Keeps product embeddings in sync: created/updated products are queued and embedded in
 * batches (unchanged text is skipped); deleted products lose their embedding.
 */
@Injectable()
export class ProductEmbeddingHandler implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private embeddingSync: EmbeddingSyncService,
    ) {}

    onModuleInit() {
        this.eventBus.ofType(ProductEvent).subscribe(event => {
            const id = Number(event.entity?.id);
            if (Number.isFinite(id)) {
                // Deletion is a soft delete; the sync sees the product is gone and removes its row.
                this.embeddingSync.schedule('product', id);
            }
        });
    }
}
