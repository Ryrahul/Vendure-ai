import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';

/**
 * Business context the admin assistant uses for forecasting and market research
 * (one per channel): where the store is, who it sells to, who it competes with.
 */
@Entity('ai_store_profile')
export class AiStoreProfile extends VendureEntity {
    constructor(input?: DeepPartial<AiStoreProfile>) {
        super(input);
    }

    @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
    channel: Channel;

    @Index({ unique: true })
    @Column()
    channelId: number;

    /** e.g. "Kathmandu" */
    @Column({ type: 'varchar', nullable: true })
    city: string | null;

    /** e.g. "Bagmati" */
    @Column({ type: 'varchar', nullable: true })
    region: string | null;

    /** ISO country code, e.g. "NP" */
    @Column({ type: 'varchar', nullable: true })
    countryCode: string | null;

    /** Regions/cities the store sells or delivers to. */
    @Column('simple-json', { nullable: true })
    serviceAreas: string[] | null;

    /** Short description of the store and its typical customers. */
    @Column({ type: 'text', nullable: true })
    businessDescription: string | null;

    /** Known competitors: names or website URLs. */
    @Column('simple-json', { nullable: true })
    competitors: string[] | null;

    /** Days from placing a purchase order with a supplier to stock arriving. */
    @Column({ type: 'int', nullable: true })
    supplierLeadTimeDays: number | null;

    @Column({ type: 'text', nullable: true })
    notes: string | null;
}
