import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { VariantEmbedding } from '../entities/variant-embedding.entity';

export interface SimilarVariantResult {
    productVariantId: number;
    score: number;
}

@Injectable()
export class VariantEmbeddingService {
    constructor(private connection: TransactionalConnection) {}

    async upsertEmbedding(
        ctx: RequestContext,
        productVariantId: number,
        embedding: number[],
    ): Promise<void> {
        await this.ensureRow(ctx, productVariantId);
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + embedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        await conn.query(
            `UPDATE ${schema}.variant_embedding SET embedding = $1::vector, "updatedAt" = NOW() WHERE "productVariantId" = $2`,
            [vectorStr, productVariantId],
        );
    }

    async deleteByVariantId(ctx: RequestContext, productVariantId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(VariantEmbedding);
        await repo.delete({ productVariantId });
    }

    async findSimilar(
        ctx: RequestContext,
        queryEmbedding: number[],
        limit: number = 5,
    ): Promise<SimilarVariantResult[]> {
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + queryEmbedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const rows = await conn.query(
            `SELECT "productVariantId", 1 - (embedding <=> $1::vector) AS score
             FROM ${schema}.variant_embedding WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector LIMIT $2`,
            [vectorStr, limit],
        );
        return (rows as { productVariantId: number; score: number }[]).map((r) => ({
            productVariantId: r.productVariantId,
            score: Number(r.score),
        }));
    }

    async ensureRow(ctx: RequestContext, productVariantId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(VariantEmbedding);
        let row = await repo.findOne({ where: { productVariantId } });
        if (!row) {
            row = repo.create({ productVariantId });
            await repo.save(row);
        }
    }
}
