import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ProductVariant, VendureEntity } from '@vendure/core';
import { EMBEDDING_DIMENSIONS } from '../constants';

/**
 * Stores vector embedding for a ProductVariant (name, sku, product name) for semantic search.
 * Embedding column is declared so TypeORM schema sync does not suggest dropping it; read/write via raw SQL.
 */
@Entity('variant_embedding')
export class VariantEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<VariantEmbedding>) {
        super(input);
    }

    @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
    @JoinColumn()
    productVariant: ProductVariant;

    @Column()
    productVariantId: number;

    @Column({ type: 'vector', length: EMBEDDING_DIMENSIONS, select: false, nullable: true })
    embedding?: string;
}
