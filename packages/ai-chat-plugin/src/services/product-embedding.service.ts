import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ProductEmbedding } from '../entities/product-embedding.entity';

export interface SimilarProductResult {
    productId: number;
    score: number;
}

/**
 * Persists and queries product embeddings using pgvector (raw SQL).
 * The embedding column is vector(embeddingDimensions), 1536 by default.
 */
@Injectable()
export class ProductEmbeddingService {
    constructor(private connection: TransactionalConnection) {}

    async upsertEmbedding(
        ctx: RequestContext,
        productId: number,
        embedding: number[],
        contentHash?: string,
    ): Promise<void> {
        await this.ensureRow(ctx, productId);
        const conn = this.connection.rawConnection;
        const vectorStr = toVectorStr(embedding);
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        await conn.query(
            `UPDATE ${schema}.product_embedding SET embedding = $1::vector, "contentHash" = $3, "updatedAt" = NOW() WHERE "productId" = $2`,
            [vectorStr, productId, contentHash ?? null],
        );
    }

    async deleteByProductId(ctx: RequestContext, productId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(ProductEmbedding);
        await repo.delete({ productId });
    }

    async findSimilar(
        ctx: RequestContext,
        queryEmbedding: number[],
        limit: number = 10,
        minScore?: number,
    ): Promise<SimilarProductResult[]> {
        const conn = this.connection.rawConnection;
        const vectorStr = toVectorStr(queryEmbedding);
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const hasThreshold = minScore != null && minScore > 0;
        const sql = hasThreshold
            ? `SELECT "productId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.product_embedding
               WHERE embedding IS NOT NULL AND (1 - (embedding <=> $1::vector)) >= $3
               ORDER BY embedding <=> $1::vector
               LIMIT $2`
            : `SELECT "productId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.product_embedding
               WHERE embedding IS NOT NULL
               ORDER BY embedding <=> $1::vector
               LIMIT $2`;
        const params = hasThreshold ? [vectorStr, limit, minScore] : [vectorStr, limit];
        const rows = await conn.query(sql, params);
        return (rows as { productId: number; score: number }[]).map((r) => ({
            productId: r.productId,
            score: Number(r.score),
        }));
    }

    /** Content hashes of rows that already have an embedding, keyed by productId. */
    async getEmbeddedHashes(productIds: number[]): Promise<Map<number, string | null>> {
        if (!productIds.length) {
            return new Map();
        }
        const conn = this.connection.rawConnection;
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const rows: Array<{ id: number; hash: string | null }> = await conn.query(
            `SELECT "productId" AS id, "contentHash" AS hash FROM ${schema}.product_embedding WHERE "productId" = ANY($1) AND embedding IS NOT NULL`,
            [productIds],
        );
        return new Map(rows.map(r => [Number(r.id), r.hash]));
    }

    /** Ensure row exists (for migration that creates table with no embedding column initially). */
    async ensureRow(ctx: RequestContext, productId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(ProductEmbedding);
        let row = await repo.findOne({ where: { productId } });
        if (!row) {
            row = repo.create({ productId });
            await repo.save(row);
        }
    }
}

function toVectorStr(arr: number[]): string {
    return '[' + arr.map((n) => Number(n)).join(',') + ']';
}
