import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Collection, VendureEntity } from '@vendure/core';

/**
 * Stores vector embedding for a Collection (name, description) for semantic search.
 */
@Entity('collection_embedding')
export class CollectionEmbedding extends VendureEntity {
    constructor(input?: DeepPartial<CollectionEmbedding>) {
        super(input);
    }

    @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
    @JoinColumn()
    collection: Collection;

    @Column()
    collectionId: number;
}
