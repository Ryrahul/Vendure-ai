import { OnModuleInit } from '@nestjs/common';
import { JobQueueService, RequestContextService, TransactionalConnection } from '@vendure/core';
import { EmbeddingService } from './embedding.service';
import { ProductEmbeddingService } from './product-embedding.service';
import { VariantEmbeddingService } from './variant-embedding.service';
import { CollectionEmbeddingService } from './collection-embedding.service';
export type EmbedAllJobData = Record<string, never>;
/**
 * Creates the embed-all job queue and processes it: loads all products, variants, collections
 * and generates/upserts embeddings in the background.
 */
export declare class EmbedAllJobService implements OnModuleInit {
    private jobQueueService;
    private requestContextService;
    private connection;
    private embeddingService;
    private productEmbeddingService;
    private variantEmbeddingService;
    private collectionEmbeddingService;
    private jobQueue;
    constructor(jobQueueService: JobQueueService, requestContextService: RequestContextService, connection: TransactionalConnection, embeddingService: EmbeddingService, productEmbeddingService: ProductEmbeddingService, variantEmbeddingService: VariantEmbeddingService, collectionEmbeddingService: CollectionEmbeddingService);
    onModuleInit(): Promise<void>;
    enqueue(): Promise<{
        jobId: string;
    }>;
    private runEmbedAll;
}
//# sourceMappingURL=embed-all-job.service.d.ts.map