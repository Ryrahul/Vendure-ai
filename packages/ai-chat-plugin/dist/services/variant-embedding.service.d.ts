import { RequestContext, TransactionalConnection } from '@vendure/core';
export interface SimilarVariantResult {
    productVariantId: number;
    score: number;
}
export declare class VariantEmbeddingService {
    private connection;
    constructor(connection: TransactionalConnection);
    upsertEmbedding(ctx: RequestContext, productVariantId: number, embedding: number[]): Promise<void>;
    deleteByVariantId(ctx: RequestContext, productVariantId: number): Promise<void>;
    findSimilar(ctx: RequestContext, queryEmbedding: number[], limit?: number): Promise<SimilarVariantResult[]>;
    ensureRow(ctx: RequestContext, productVariantId: number): Promise<void>;
}
//# sourceMappingURL=variant-embedding.service.d.ts.map