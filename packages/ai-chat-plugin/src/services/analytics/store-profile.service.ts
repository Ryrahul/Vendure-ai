import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { AiStoreProfile } from '../../entities/ai-store-profile.entity';

export type StoreProfileInput = Partial<
    Pick<
        AiStoreProfile,
        'city' | 'region' | 'countryCode' | 'serviceAreas' | 'businessDescription' | 'competitors' | 'supplierLeadTimeDays' | 'notes'
    >
>;

export const DEFAULT_LEAD_TIME_DAYS = 14;

/** The store profile of the active channel. */
@Injectable()
export class StoreProfileService {
    constructor(private connection: TransactionalConnection) {}

    async get(ctx: RequestContext): Promise<AiStoreProfile | undefined> {
        return (await this.connection.getRepository(ctx, AiStoreProfile).findOne({ where: { channelId: Number(ctx.channelId) } })) ?? undefined;
    }

    /** Merges the given fields into the profile (creating it if needed). Unset fields are left unchanged. */
    async update(ctx: RequestContext, input: StoreProfileInput): Promise<AiStoreProfile> {
        const repo = this.connection.getRepository(ctx, AiStoreProfile);
        const existing = await this.get(ctx);
        const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
        if (clean.countryCode) clean.countryCode = String(clean.countryCode).toUpperCase().slice(0, 2);
        if (clean.supplierLeadTimeDays != null) {
            clean.supplierLeadTimeDays = Math.max(0, Math.min(365, Math.round(Number(clean.supplierLeadTimeDays))));
        }
        const profile = existing ? Object.assign(existing, clean) : new AiStoreProfile({ ...clean, channelId: Number(ctx.channelId) });
        return repo.save(profile);
    }

    /** Which important fields are still unknown, so the assistant can ask for them. */
    missingFields(profile: AiStoreProfile | undefined): string[] {
        const missing: string[] = [];
        if (!profile?.city && !profile?.region) missing.push('store location (city/region)');
        if (!profile?.countryCode) missing.push('country');
        if (!profile?.serviceAreas?.length) missing.push('regions/cities you sell or deliver to');
        if (!profile?.businessDescription) missing.push('what the store sells and who its customers are');
        if (profile?.supplierLeadTimeDays == null) missing.push(`supplier lead time (assuming ${DEFAULT_LEAD_TIME_DAYS} days)`);
        return missing;
    }
}
