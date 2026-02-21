import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ProductVariant, VendureEntity } from '@vendure/core';

/**
 * Stores vector embedding for a ProductVariant (name, sku, product name) for semantic search.
 * Add-to-cart (Phase 2) uses variant ID; embedding enables discovery by intent.
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
}
