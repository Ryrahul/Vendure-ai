import { Injectable, OnModuleInit } from '@nestjs/common';
import { CollectionEvent, EventBus } from '@vendure/core';

import { EmbeddingSyncService } from '../services/embedding-sync.service';

/**
 * Keeps collection embeddings in sync: changes are queued and embedded in batches
 * (unchanged text is skipped); deleted collections lose their embedding.
 */
@Injectable()
export class CollectionEmbeddingHandler implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private embeddingSync: EmbeddingSyncService,
    ) {}

    onModuleInit() {
        this.eventBus.ofType(CollectionEvent).subscribe(event => {
            const id = Number(event.entity?.id);
            if (Number.isFinite(id)) {
                this.embeddingSync.schedule('collection', id);
            }
        });
    }
}
