import { DeepPartial } from '@vendure/common/lib/shared-types';
import { ProductVariant, VendureEntity } from '@vendure/core';
/**
 * Stores vector embedding for a ProductVariant (name, sku, product name) for semantic search.
 * Embedding column is declared so TypeORM schema sync does not suggest dropping it; read/write via raw SQL.
 */
export declare class VariantEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<VariantEmbedding>);
    productVariant: ProductVariant;
    productVariantId: number;
    embedding?: string;
}
//# sourceMappingURL=variant-embedding.entity.d.ts.map