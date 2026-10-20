import { Injectable } from '@nestjs/common';
import { Channel, RequestContext, TransactionalConnection } from '@vendure/core';

import { AiStoreProfile } from '../../entities/ai-store-profile.entity';
import { SalesAnalyticsService } from './sales-analytics.service';

export type StoreProfileInput = Partial<
    Pick<
        AiStoreProfile,
        'city' | 'region' | 'countryCode' | 'serviceAreas' | 'businessDescription' | 'competitors' | 'supplierLeadTimeDays' | 'notes'
    >
>;

export const DEFAULT_LEAD_TIME_DAYS = 14;

/** A location worked out from the store's own data, used until the admin saves a real one. */
export interface InferredLocation {
    countryCode: string;
    region?: string;
    city?: string;
    /** Where it came from, for the assistant to state its assumption. */
    source: string;
}

/** The store profile of the active channel. */
@Injectable()
export class StoreProfileService {
    constructor(
        private connection: TransactionalConnection,
        private analytics: SalesAnalyticsService,
    ) {}

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

    /**
     * The store's likely location when the profile has none: where most orders ship to,
     * otherwise the country of the channel's tax or shipping zone when it has exactly one.
     */
    async inferLocation(ctx: RequestContext): Promise<InferredLocation | undefined> {
        const shipping = await this.analytics.mainShippingLocation(ctx);
        if (shipping) {
            return { ...shipping, source: `most orders ship there (${shipping.orders} orders in the last year)` };
        }
        const channel = await this.connection.getRepository(ctx, Channel).findOne({
            where: { id: ctx.channelId },
            relations: ['defaultTaxZone', 'defaultTaxZone.members', 'defaultShippingZone', 'defaultShippingZone.members'],
        });
        for (const zone of [channel?.defaultTaxZone, channel?.defaultShippingZone]) {
            const countries = (zone?.members ?? []).filter(m => (m as any).type === 'country' || !(m as any).type);
            if (countries.length === 1 && countries[0].code) {
                return { countryCode: countries[0].code.toUpperCase(), source: `the channel's ${zone === channel?.defaultTaxZone ? 'tax' : 'shipping'} zone "${zone!.name}"` };
            }
        }
        return undefined;
    }

    /** The saved location, or the inferred one. */
    async location(ctx: RequestContext): Promise<{ city?: string; region?: string; countryCode?: string }> {
        const profile = await this.get(ctx);
        if (profile?.countryCode || profile?.city || profile?.region) {
            return { city: profile.city ?? undefined, region: profile.region ?? undefined, countryCode: profile.countryCode ?? undefined };
        }
        const inferred = await this.inferLocation(ctx);
        return inferred ? { city: inferred.city, region: inferred.region, countryCode: inferred.countryCode } : {};
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
