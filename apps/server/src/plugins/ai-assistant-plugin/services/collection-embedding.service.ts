import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CollectionEmbedding } from '../entities/collection-embedding.entity';

export interface SimilarCollectionResult {
    collectionId: number;
    score: number;
}

@Injectable()
export class CollectionEmbeddingService {
    constructor(private connection: TransactionalConnection) {}

    async upsertEmbedding(
        ctx: RequestContext,
        collectionId: number,
        embedding: number[],
    ): Promise<void> {
        await this.ensureRow(ctx, collectionId);
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + embedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        await conn.query(
            `UPDATE ${schema}.collection_embedding SET embedding = $1::vector, "updatedAt" = NOW() WHERE "collectionId" = $2`,
            [vectorStr, collectionId],
        );
    }

    async deleteByCollectionId(ctx: RequestContext, collectionId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(CollectionEmbedding);
        await repo.delete({ collectionId });
    }

    async findSimilar(
        ctx: RequestContext,
        queryEmbedding: number[],
        limit: number = 5,
    ): Promise<SimilarCollectionResult[]> {
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + queryEmbedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const rows = await conn.query(
            `SELECT "collectionId", 1 - (embedding <=> $1::vector) AS score
             FROM ${schema}.collection_embedding WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector LIMIT $2`,
            [vectorStr, limit],
        );
        return (rows as { collectionId: number; score: number }[]).map((r) => ({
            collectionId: r.collectionId,
            score: Number(r.score),
        }));
    }

    async ensureRow(ctx: RequestContext, collectionId: number): Promise<void> {
        const repo = this.connection.rawConnection.getRepository(CollectionEmbedding);
        let row = await repo.findOne({ where: { collectionId } });
        if (!row) {
            row = repo.create({ collectionId });
            await repo.save(row);
        }
    }
}
