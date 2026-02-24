import { RequestContext, TransactionalConnection } from '@vendure/core';
export interface SimilarProductResult {
    productId: number;
    score: number;
}
/**
 * Persists and queries product embeddings using pgvector (raw SQL).
 * Table must have embedding vector(1536); migration creates it.
 */
export declare class ProductEmbeddingService {
    private connection;
    constructor(connection: TransactionalConnection);
    upsertEmbedding(ctx: RequestContext, productId: number, embedding: number[]): Promise<void>;
    deleteByProductId(ctx: RequestContext, productId: number): Promise<void>;
    findSimilar(ctx: RequestContext, queryEmbedding: number[], limit?: number, minScore?: number): Promise<SimilarProductResult[]>;
    /** Ensure row exists (for migration that creates table with no embedding column initially). */
    ensureRow(ctx: RequestContext, productId: number): Promise<void>;
}
//# sourceMappingURL=product-embedding.service.d.ts.map