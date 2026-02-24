import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Collection, VendureEntity } from '@vendure/core';
/**
 * Stores vector embedding for a Collection (name, description) for semantic search.
 * Embedding column is declared so TypeORM schema sync does not suggest dropping it; read/write via raw SQL.
 */
export declare class CollectionEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<CollectionEmbedding>);
    collection: Collection;
    collectionId: number;
    embedding?: string;
}
//# sourceMappingURL=collection-embedding.entity.d.ts.map