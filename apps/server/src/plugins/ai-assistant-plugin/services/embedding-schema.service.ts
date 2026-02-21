import { Injectable, OnModuleInit } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { EMBEDDING_DIMENSIONS } from '../constants';

/**
 * Ensures pgvector embedding columns exist on the embedding tables.
 * Runs once on module init so the plugin manages its own schema — no separate migration needed.
 */
@Injectable()
export class EmbeddingSchemaService implements OnModuleInit {
    constructor(private connection: TransactionalConnection) {}

    async onModuleInit() {
        const conn = this.connection.rawConnection;
        const schema = (conn.options as { schema?: string }).schema ?? 'public';
        const dim = EMBEDDING_DIMENSIONS;

        try {
            await conn.query(`CREATE EXTENSION IF NOT EXISTS vector`);
        } catch (e) {
            // Extension might already exist or not be available
        }

        for (const table of ['product_embedding', 'variant_embedding', 'collection_embedding']) {
            try {
                await conn.query(
                    `ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS embedding vector(${dim})`,
                );
            } catch (e) {
                // Column might already exist; ignore
            }
        }
    }
}
