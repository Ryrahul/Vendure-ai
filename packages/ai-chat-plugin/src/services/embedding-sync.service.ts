import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Collection, Product, RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { createHash } from 'crypto';
import { In, IsNull } from 'typeorm';

import { CollectionEmbeddingService } from './collection-embedding.service';
import { buildEmbeddingText } from './embedding-text';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';

type Kind = 'product' | 'collection';

export interface EmbeddingSyncResult {
    embedded: number;
    unchanged: number;
    removed: number;
}

/** How long catalog changes are collected before they are embedded together. */
const DEBOUNCE_MS = 1500;
/** Flush immediately once this many changes are pending. */
const MAX_PENDING = 100;
/** Entities loaded and embedded per round. */
const BATCH_SIZE = 100;

/**
 * Keeps product and collection embeddings in sync with the catalog, cheaply:
 *
 * - changes are debounced and embedded together (one OpenAI request per 100 texts);
 * - each row stores a hash of (model + text), so unchanged entities are never re-embedded
 *   — re-running the full backfill costs nothing for an unchanged catalog;
 * - descriptions are converted from HTML to plain text first.
 */
@Injectable()
export class EmbeddingSyncService implements OnApplicationShutdown {
    private readonly logger = new Logger(EmbeddingSyncService.name);
    private pending: Record<Kind, Set<number>> = { product: new Set(), collection: new Set() };
    private timer?: NodeJS.Timeout;
    private running: Promise<void> = Promise.resolve();

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {}

    /** Queues an entity to be (re-)embedded shortly. */
    schedule(kind: Kind, id: number) {
        this.pending[kind].add(id);
        const total = this.pending.product.size + this.pending.collection.size;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => void this.flush(), total >= MAX_PENDING ? 0 : DEBOUNCE_MS);
    }

    /** Embeds everything queued so far. Runs are serialised, never concurrent. */
    flush(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        const products = [...this.pending.product];
        const collections = [...this.pending.collection];
        this.pending = { product: new Set(), collection: new Set() };
        this.running = this.running.then(async () => {
            try {
                if (products.length) await this.syncProducts(products);
                if (collections.length) await this.syncCollections(collections);
            } catch (e: any) {
                this.logger.error(`Embedding sync failed: ${e?.message ?? e}`);
            }
        });
        return this.running;
    }

    async onApplicationShutdown() {
        await this.flush();
    }

    async syncProducts(productIds: number[]): Promise<EmbeddingSyncResult> {
        return this.sync('product', productIds);
    }

    async syncCollections(collectionIds: number[]): Promise<EmbeddingSyncResult> {
        return this.sync('collection', collectionIds);
    }

    private async sync(kind: Kind, ids: number[]): Promise<EmbeddingSyncResult> {
        const total: EmbeddingSyncResult = { embedded: 0, unchanged: 0, removed: 0 };
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const r = await this.syncBatch(ctx, kind, ids.slice(i, i + BATCH_SIZE));
            total.embedded += r.embedded;
            total.unchanged += r.unchanged;
            total.removed += r.removed;
        }
        if (total.embedded || total.removed) {
            this.logger.log(`Embeddings (${kind}): ${total.embedded} embedded, ${total.unchanged} unchanged, ${total.removed} removed`);
        }
        return total;
    }

    private async syncBatch(ctx: RequestContext, kind: Kind, ids: number[]): Promise<EmbeddingSyncResult> {
        const entities: Array<{ id: number; translations?: any[] }> =
            kind === 'product'
                ? await this.connection.rawConnection.getRepository(Product).find({
                      where: { id: In(ids), deletedAt: IsNull() },
                      relations: ['translations'],
                  }) as any
                : await this.connection.rawConnection.getRepository(Collection).find({
                      where: { id: In(ids), isRoot: false },
                      relations: ['translations'],
                  }) as any;
        const store = kind === 'product' ? this.productEmbeddingService : this.collectionEmbeddingService;

        // Entities that no longer exist (or are deleted) lose their embedding.
        const found = new Set(entities.map(e => Number(e.id)));
        const gone = ids.filter(id => !found.has(id));
        for (const id of gone) {
            kind === 'product'
                ? await this.productEmbeddingService.deleteByProductId(ctx, id)
                : await this.collectionEmbeddingService.deleteByCollectionId(ctx, id);
        }

        const texts = new Map<number, { text: string; hash: string }>();
        for (const entity of entities) {
            const text = buildEmbeddingText(entity.translations);
            if (text) {
                texts.set(Number(entity.id), { text, hash: this.hash(text) });
            }
        }
        const existing = await store.getEmbeddedHashes([...texts.keys()]);
        const changed = [...texts.entries()].filter(([id, { hash }]) => existing.get(id) !== hash);
        if (changed.length) {
            const vectors = await this.embeddingService.embedMany(changed.map(([, { text }]) => text));
            for (const [index, [id, { hash }]] of changed.entries()) {
                kind === 'product'
                    ? await this.productEmbeddingService.upsertEmbedding(ctx, id, vectors[index], hash)
                    : await this.collectionEmbeddingService.upsertEmbedding(ctx, id, vectors[index], hash);
            }
        }
        return { embedded: changed.length, unchanged: texts.size - changed.length, removed: gone.length };
    }

    private hash(text: string): string {
        return createHash('sha256').update(`${this.embeddingService.model}\n${text}`).digest('hex');
    }
}
