import { Injectable, OnModuleInit } from '@nestjs/common';
import { Collection, JobQueue, JobQueueService, Logger, Product, TransactionalConnection } from '@vendure/core';
import { IsNull } from 'typeorm';
import { EMBED_ALL_QUEUE_NAME } from '../constants';
import { EmbeddingSyncService } from './embedding-sync.service';

export type EmbedAllJobData = Record<string, never>;

/**
 * Creates the embed-all job queue and processes it: (re-)embeds all products and collections
 * in the background, skipping those whose text has not changed.
 */
@Injectable()
export class EmbedAllJobService implements OnModuleInit {
    private jobQueue!: JobQueue<EmbedAllJobData>;

    constructor(
        private jobQueueService: JobQueueService,
        private connection: TransactionalConnection,
        private embeddingSync: EmbeddingSyncService,
    ) {}

    async onModuleInit() {
        this.jobQueue = await this.jobQueueService.createQueue({
            name: EMBED_ALL_QUEUE_NAME,
            process: async () => {
                await this.runEmbedAll();
            },
        });
    }

    async enqueue(): Promise<{ jobId: string }> {
        const job = await this.jobQueue.add({});
        return { jobId: String(job.id) };
    }

    /**
     * Embeds the whole catalog. Only entities whose text changed since they were last
     * embedded are sent to OpenAI, so re-running this is cheap.
     */
    private async runEmbedAll(): Promise<void> {
        const conn = this.connection.rawConnection;
        const productIds = (
            await conn.getRepository(Product).find({ where: { deletedAt: IsNull() }, select: ['id'] })
        ).map(p => Number(p.id));
        const collectionIds = (
            await conn.getRepository(Collection).find({ where: { isRoot: false }, select: ['id'] })
        ).map(c => Number(c.id));
        const products = await this.embeddingSync.syncProducts(productIds);
        const collections = await this.embeddingSync.syncCollections(collectionIds);
        Logger.info(
            `Embed-all done. Products: ${products.embedded} embedded, ${products.unchanged} unchanged. ` +
                `Collections: ${collections.embedded} embedded, ${collections.unchanged} unchanged.`,
            'AiAssistantPlugin',
        );
    }
}
