import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Collection, VendureEntity } from '@vendure/core';
import { EMBEDDING_DIMENSIONS } from '../constants';

/**
 * Stores vector embedding for a Collection (name, description) for semantic search.
 * Embedding column is declared so TypeORM schema sync does not suggest dropping it; read/write via raw SQL.
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

    @Column({ type: 'vector', length: EMBEDDING_DIMENSIONS, select: false, nullable: true })
    embedding?: string;
}
