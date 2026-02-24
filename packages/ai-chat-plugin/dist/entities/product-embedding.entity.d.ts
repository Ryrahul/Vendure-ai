import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Product, VendureEntity } from '@vendure/core';
/**
 * Stores vector embedding for a Product (name + description) for semantic search.
 * Embedding column is declared so TypeORM schema sync (synchronize: false) does not suggest dropping it;
 * actual read/write is via raw SQL in ProductEmbeddingService.
 */
export declare class ProductEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<ProductEmbedding>);
    product: Product;
    productId: number;
    embedding?: string;
}
//# sourceMappingURL=product-embedding.entity.d.ts.map