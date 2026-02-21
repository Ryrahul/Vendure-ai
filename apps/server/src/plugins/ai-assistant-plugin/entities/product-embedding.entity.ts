import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Product, VendureEntity } from '@vendure/core';
import { EMBEDDING_DIMENSIONS } from '../constants';

/**
 * Stores vector embedding for a Product (name + description) for semantic search.
 * Embedding column is declared so TypeORM schema sync (synchronize: false) does not suggest dropping it;
 * actual read/write is via raw SQL in ProductEmbeddingService.
 */
@Entity('product_embedding')
export class ProductEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<ProductEmbedding>) {
        super(input);
    }

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    productId: number;

    @Column({ type: 'vector', length: EMBEDDING_DIMENSIONS, select: false })
    embedding?: string;
}
