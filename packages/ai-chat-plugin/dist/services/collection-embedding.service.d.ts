import { RequestContext, TransactionalConnection } from '@vendure/core';
export interface SimilarCollectionResult {
    collectionId: number;
    score: number;
}
export declare class CollectionEmbeddingService {
    private connection;
    constructor(connection: TransactionalConnection);
    upsertEmbedding(ctx: RequestContext, collectionId: number, embedding: number[]): Promise<void>;
    deleteByCollectionId(ctx: RequestContext, collectionId: number): Promise<void>;
    findSimilar(ctx: RequestContext, queryEmbedding: number[], limit?: number, minScore?: number): Promise<SimilarCollectionResult[]>;
    ensureRow(ctx: RequestContext, collectionId: number): Promise<void>;
}
//# sourceMappingURL=collection-embedding.service.d.ts.map