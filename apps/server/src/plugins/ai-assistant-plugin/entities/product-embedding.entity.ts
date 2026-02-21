import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Product, VendureEntity } from '@vendure/core';

/**
 * Stores vector embedding for a Product (name + description) for semantic search.
 * Embedding is stored in pgvector column; entity keeps only productId for ORM; embedding read/write via raw SQL.
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
}
