import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    EventBus,
    CollectionEvent,
    TransactionalConnection,
    Collection,
} from '@vendure/core';
import { filter } from 'rxjs/operators';
import { EmbeddingService } from '../services/embedding.service';
import { CollectionEmbeddingService } from '../services/collection-embedding.service';

/**
 * Subscribes to Collection created/updated/deleted; keeps CollectionEmbedding in sync.
 */
@Injectable()
export class CollectionEmbeddingHandler implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {}

    onModuleInit() {
        this.eventBus
            .ofType(CollectionEvent)
            .pipe(
                filter(
                    (e) =>
                        e.type === 'created' || e.type === 'updated' || e.type === 'deleted',
                ),
            )
            .subscribe((event: CollectionEvent) => {
                if (event.type === 'deleted') {
                    const id = this.getCollectionId(event.entity);
                    if (id != null)
                        this.collectionEmbeddingService
                            .deleteByCollectionId(event.ctx, id)
                            .catch((err) =>
                                console.error(
                                    '[AiAssistantPlugin] Failed to delete collection embedding',
                                    id,
                                    err,
                                ),
                            );
                    return;
                }
                this.embedCollection(event).catch((err) =>
                    console.error(
                        '[AiAssistantPlugin] Failed to embed collection',
                        event.entity?.id,
                        err,
                    ),
                );
            });
    }

    private getCollectionId(c: Collection): number | null {
        const id = c?.id;
        if (id == null) return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }

    private async embedCollection(event: CollectionEvent): Promise<void> {
        const collectionId = this.getCollectionId(event.entity);
        if (collectionId == null) return;

        const repo = this.connection.rawConnection.getRepository(Collection);
        const collection = await repo.findOne({
            where: { id: collectionId },
            relations: ['translations'],
        });
        if (!collection?.translations?.length) return;

        const text = buildCollectionText(collection);
        if (!text.trim()) return;

        const embedding = await this.embeddingService.embed(text);
        await this.collectionEmbeddingService.upsertEmbedding(
            event.ctx,
            collectionId,
            embedding,
        );
    }
}

function buildCollectionText(collection: Collection): string {
    const parts: string[] = [];
    for (const t of (collection.translations as { name?: string; description?: string }[]) || []) {
        if (t?.name) parts.push(String(t.name));
        if (t?.description) parts.push(String(t.description));
    }
    return parts.join(' ').trim();
}
