import { OnModuleInit } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
/**
 * Ensures pgvector embedding columns exist on the embedding tables.
 * Runs once on module init so the plugin manages its own schema — no separate migration needed.
 */
export declare class EmbeddingSchemaService implements OnModuleInit {
    private connection;
    constructor(connection: TransactionalConnection);
    onModuleInit(): Promise<void>;
}
//# sourceMappingURL=embedding-schema.service.d.ts.map