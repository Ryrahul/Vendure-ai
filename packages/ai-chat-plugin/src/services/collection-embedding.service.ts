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
        contentHash?: string,
    ): Promise<void> {
        await this.ensureRow(ctx, collectionId);
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + embedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        await conn.query(
            `UPDATE ${schema}.collection_embedding SET embedding = $1::vector, "contentHash" = $3, "updatedAt" = NOW() WHERE "collectionId" = $2`,
            [vectorStr, collectionId, contentHash ?? null],
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
        minScore?: number,
    ): Promise<SimilarCollectionResult[]> {
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + queryEmbedding.map((n) => Number(n)).join(',') + ']';
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const hasThreshold = minScore != null && minScore > 0;
        const sql = hasThreshold
            ? `SELECT "collectionId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.collection_embedding
               WHERE embedding IS NOT NULL AND (1 - (embedding <=> $1::vector)) >= $3
               ORDER BY embedding <=> $1::vector LIMIT $2`
            : `SELECT "collectionId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.collection_embedding WHERE embedding IS NOT NULL
               ORDER BY embedding <=> $1::vector LIMIT $2`;
        const params = hasThreshold ? [vectorStr, limit, minScore] : [vectorStr, limit];
        const rows = await conn.query(sql, params);
        return (rows as { collectionId: number; score: number }[]).map((r) => ({
            collectionId: r.collectionId,
            score: Number(r.score),
        }));
    }

    /** Content hashes of rows that already have an embedding, keyed by collectionId. */
    async getEmbeddedHashes(collectionIds: number[]): Promise<Map<number, string | null>> {
        if (!collectionIds.length) {
            return new Map();
        }
        const conn = this.connection.rawConnection;
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const rows: Array<{ id: number; hash: string | null }> = await conn.query(
            `SELECT "collectionId" AS id, "contentHash" AS hash FROM ${schema}.collection_embedding WHERE "collectionId" = ANY($1) AND embedding IS NOT NULL`,
            [collectionIds],
        );
        return new Map(rows.map(r => [Number(r.id), r.hash]));
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
