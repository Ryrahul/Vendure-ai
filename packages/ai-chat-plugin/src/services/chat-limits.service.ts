import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@vendure/core';

import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions, type ChatLimitsOptions } from '../constants';


const DEFAULTS: Required<ChatLimitsOptions> = {
    shopMessagesPerMinute: 20,
    shopMessagesPerMinutePerIp: 60,
    shopTokensPerDay: 200_000,
    adminMessagesPerMinute: 30,
    adminTokensPerDay: 1_000_000,
};

export type ChatAudience = 'shop' | 'admin';

/**
 * Per-shopper / per-administrator message rate limits and daily token budgets, stored in
 * Vendure's CacheService (shared between instances when a shared cache strategy is used).
 *
 * Message limits use a one-minute window starting at the caller's first message; token
 * budgets reset at UTC midnight. Counters are updated read-modify-write, so under heavy
 * concurrency a caller may slightly exceed a limit: a cost guard-rail, not an exact quota.
 */
@Injectable()
export class ChatLimitsService {
    private readonly limits: Required<ChatLimitsOptions>;

    constructor(
        private cacheService: CacheService,
        @Inject(AI_ASSISTANT_OPTIONS) options: AiAssistantPluginOptions,
    ) {
        this.limits = { ...DEFAULTS, ...(options.limits ?? {}) };
    }

    /**
     * Call before running the model. Counts the message and throws HTTP 429 if a limit
     * is exceeded (the message is then not counted against the token budget).
     */
    async checkBeforeChat(audience: ChatAudience, ownerKey: string, ip?: string): Promise<void> {
        const perMinute = audience === 'shop' ? this.limits.shopMessagesPerMinute : this.limits.adminMessagesPerMinute;
        const tokensPerDay = audience === 'shop' ? this.limits.shopTokensPerDay : this.limits.adminTokensPerDay;

        if (tokensPerDay > 0 && (await this.read(this.tokenKey(audience, ownerKey))) >= tokensPerDay) {
            throw new HttpException(
                'Daily assistant usage limit reached. Please try again tomorrow.',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        if (perMinute > 0 && (await this.increment(this.minuteKey(audience, ownerKey), 60_000)) > perMinute) {
            throw new HttpException('Too many messages. Please wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
        }
        const perIp = this.limits.shopMessagesPerMinutePerIp;
        if (audience === 'shop' && ip && perIp > 0 && (await this.increment(this.minuteKey('shop', `ip:${ip}`), 60_000)) > perIp) {
            throw new HttpException('Too many messages. Please wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    /** Call after the model finished, with the tokens it used. */
    async recordUsage(audience: ChatAudience, ownerKey: string, totalTokens: number | undefined): Promise<void> {
        if (!totalTokens || totalTokens <= 0) {
            return;
        }
        await this.increment(this.tokenKey(audience, ownerKey), msUntilUtcMidnight(), totalTokens);
    }

    private minuteKey(audience: ChatAudience, ownerKey: string) {
        return `ai-chat-rate:${audience}:${ownerKey}`;
    }

    private tokenKey(audience: ChatAudience, ownerKey: string) {
        return `ai-chat-tokens:${audience}:${ownerKey}:${new Date().toISOString().slice(0, 10)}`;
    }

    /** Current count of a window, or 0 if it has not started or has expired. */
    private async read(key: string): Promise<number> {
        const window = await this.cacheService.get<{ count: number; resetAt: number }>(key);
        return window && window.resetAt > Date.now() ? window.count : 0;
    }

    /**
     * Fixed window that starts at the first hit (not aligned to the clock), so a burst
     * cannot straddle a boundary and get double the allowance.
     */
    private async increment(key: string, windowMs: number, by = 1): Promise<number> {
        const now = Date.now();
        const window = await this.cacheService.get<{ count: number; resetAt: number }>(key);
        const active = window && window.resetAt > now ? window : { count: 0, resetAt: now + windowMs };
        const next = { count: active.count + by, resetAt: active.resetAt };
        await this.cacheService.set(key, next, { ttl: Math.max(1000, next.resetAt - now) });
        return next.count;
    }
}

function msUntilUtcMidnight(): number {
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1000, midnight - now.getTime());
}
