import { Injectable } from '@nestjs/common';
import { CacheService, ID } from '@vendure/core';
import { randomUUID } from 'crypto';

/** An admin tool call the model requested but that only runs once a human confirms it. */
export interface PendingAdminAction {
    id: string;
    administratorId: string;
    channelId: string;
    sessionId?: string;
    toolName: string;
    input: Record<string, unknown>;
    /** Human-readable description shown on the Confirm button. */
    description: string;
    createdAt: number;
}

/** What the dashboard receives: everything needed to render Confirm / Cancel. */
export type PendingAdminActionView = Pick<PendingAdminAction, 'id' | 'toolName' | 'description'>;

const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Stores destructive admin actions until the administrator confirms them in the UI.
 *
 * The model can only *request* such an action; executing it requires a separate HTTP call
 * by the same administrator (the Confirm button), which the model cannot make. Pending
 * actions are bound to the requesting administrator, single-use, and expire after 10 minutes.
 */
@Injectable()
export class AdminConfirmationService {
    /** Guards against a double-click executing the same action twice in this process. */
    private readonly inFlight = new Set<string>();

    constructor(private cacheService: CacheService) {}

    async request(input: Omit<PendingAdminAction, 'id' | 'createdAt' | 'administratorId' | 'channelId'> & {
        administratorId: ID;
        channelId: ID;
    }): Promise<PendingAdminAction> {
        const action: PendingAdminAction = {
            ...input,
            id: randomUUID(),
            administratorId: String(input.administratorId),
            channelId: String(input.channelId),
            createdAt: Date.now(),
        };
        await this.cacheService.set(this.key(action.id), JSON.stringify(action), { ttl: PENDING_TTL_MS });
        return action;
    }

    /**
     * Removes and returns the pending action if it exists and belongs to the administrator.
     * Returns undefined otherwise (unknown, expired, already used, or someone else's).
     */
    async take(administratorId: ID, id: string): Promise<PendingAdminAction | undefined> {
        if (!isUuid(id) || this.inFlight.has(id)) {
            return undefined;
        }
        this.inFlight.add(id);
        try {
            const stored = await this.cacheService.get<string>(this.key(id));
            const action = stored ? (JSON.parse(stored) as PendingAdminAction) : undefined;
            if (!action || action.administratorId !== String(administratorId)) {
                return undefined;
            }
            await this.cacheService.delete(this.key(id));
            return action;
        } finally {
            this.inFlight.delete(id);
        }
    }

    private key(id: string) {
        return `ai-admin-pending-action:${id}`;
    }
}

function isUuid(id: unknown): id is string {
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
