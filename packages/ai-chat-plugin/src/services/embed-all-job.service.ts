import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    JobQueueService,
    JobQueue,
    RequestContextService,
    TransactionalConnection,
    Product,
    ProductVariant,
    Collection,
} from '@vendure/core';
import { EMBED_ALL_QUEUE_NAME } from '../constants';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { VariantEmbeddingService } from './variant-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';

export type EmbedAllJobData = Record<string, never>;

/**
 * Creates the embed-all job queue and processes it: loads all products, variants, collections
 * and generates/upserts embeddings in the background.
 */
@Injectable()
export class EmbedAllJobService implements OnModuleInit {
    private jobQueue!: JobQueue<EmbedAllJobData>;

    constructor(
        private jobQueueService: JobQueueService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private embeddingService: EmbeddingService,
        private productEmbeddingService: ProductEmbeddingService,
        private variantEmbeddingService: VariantEmbeddingService,
        private collectionEmbeddingService: CollectionEmbeddingService,
    ) {}

    async onModuleInit() {
        this.jobQueue = await this.jobQueueService.createQueue({
            name: EMBED_ALL_QUEUE_NAME,
            process: async () => {
                const ctx = await this.requestContextService.create({
                    apiType: 'admin',
                });
                await this.runEmbedAll(ctx);
            },
        });
    }

    async enqueue(): Promise<{ jobId: string }> {
        const job = await this.jobQueue.add({});
        return { jobId: String(job.id) };
    }

    private async runEmbedAll(ctx: unknown): Promise<void> {
        const reqCtx = ctx as any;
        const conn = this.connection.rawConnection;
        const productRepo = conn.getRepository(Product);
        const variantRepo = conn.getRepository(ProductVariant);
        const collectionRepo = conn.getRepository(Collection);

        const products = await productRepo.find({
            relations: ['translations'],
        });
        for (const product of products) {
            const text = buildProductText(product);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.productEmbeddingService.upsertEmbedding(
                        reqCtx,
                        product.id as number,
                        embedding,
                    );
                } catch (e) {
                    console.error('[AiAssistantPlugin] embed-all product', product.id, e);
                }
            }
        }

        const variants = await variantRepo.find({
            relations: ['translations', 'product', 'product.translations'],
        });
        for (const variant of variants) {
            const text = buildVariantText(variant);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.variantEmbeddingService.upsertEmbedding(
                        reqCtx,
                        variant.id as number,
                        embedding,
                    );
                } catch (e) {
                    console.error('[AiAssistantPlugin] embed-all variant', variant.id, e);
                }
            }
        }

        const collections = await collectionRepo.find({
            relations: ['translations'],
        });
        for (const collection of collections) {
            const text = buildCollectionText(collection);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.collectionEmbeddingService.upsertEmbedding(
                        reqCtx,
                        collection.id as number,
                        embedding,
                    );
                } catch (e) {
                    console.error('[AiAssistantPlugin] embed-all collection', collection.id, e);
                }
            }
        }
    }
}

function buildProductText(product: Product): string {
    const parts: string[] = [];
    for (const t of (product.translations as { name?: string; description?: string }[]) || []) {
        if (t?.name) parts.push(String(t.name));
        if (t?.description) parts.push(String(t.description));
    }
    return parts.join(' ').trim();
}

function buildVariantText(
    variant: ProductVariant & { product?: Product; translations?: { name?: string }[] },
): string {
    const parts: string[] = [];
    for (const t of variant.translations || []) {
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

function buildCollectionText(
    collection: Collection & { translations?: { name?: string; description?: string }[] },
): string {
    const parts: string[] = [];
    for (const t of collection.translations || []) {
        if (t?.name) parts.push(String(t.name));
        if (t?.description) parts.push(String(t.description));
    }
    return parts.join(' ').trim();
}
