import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CacheService } from '@vendure/core';

export interface CachedConversation {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    customerId?: string | number;
    createdAt: number;
    lastActiveAt: number;
}

/** TTL for cached conversations: 30 minutes */
const CONVERSATION_TTL_MS = 1000 * 60 * 30;

/**
 * Caches conversation history server-side using Vendure's CacheService.
 *
 * Instead of the frontend sending the full message history on every request,
 * the server maintains the history keyed by a `conversationId` (UUID generated
 * by the frontend when the chat widget mounts).
 *
 * Conversations expire after 30 minutes of inactivity.
 */
@Injectable()
export class ConversationCacheService implements OnModuleInit {
    private readonly logger = new Logger(ConversationCacheService.name);

    constructor(private cacheService: CacheService) {}

    onModuleInit() {
        this.logger.log('ConversationCacheService initialized');
    }

    private cacheKey(conversationId: string): string {
        return `ai-chat:conversation:${conversationId}`;
    }

    /**
     * Retrieve the cached conversation history for a given conversationId.
     * Returns undefined if the conversation has expired or doesn't exist.
     */
    async getHistory(conversationId: string): Promise<CachedConversation | undefined> {
        return this.cacheService.get<CachedConversation>(this.cacheKey(conversationId));
    }

    /**
     * Append a user message and the corresponding assistant response to the
     * cached conversation. If the conversation doesn't exist yet, it is
     * created implicitly.
     */
    async appendMessages(
        conversationId: string,
        userMessage: string,
        assistantResponse: string,
        customerId?: string | number,
    ): Promise<void> {
        const existing = await this.getHistory(conversationId);
        const messages = existing?.messages ?? [];

        messages.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: assistantResponse },
        );

        const now = Date.now();
        await this.cacheService.set<CachedConversation>(
            this.cacheKey(conversationId),
            {
                messages,
                customerId: customerId ?? existing?.customerId,
                createdAt: existing?.createdAt ?? now,
                lastActiveAt: now,
            },
            {
                ttl: CONVERSATION_TTL_MS,
                tags: ['ai-chat-conversations'],
            },
        );

        this.logger.debug(
            `Conversation ${conversationId}: ${messages.length} messages cached`,
        );
    }

    /**
     * Delete a specific conversation from cache.
     */
    async deleteConversation(conversationId: string): Promise<void> {
        await this.cacheService.delete(this.cacheKey(conversationId));
        this.logger.debug(`Conversation ${conversationId} deleted from cache`);
    }

    /**
     * Invalidate all cached conversations (e.g. on deployment or cache reset).
     */
    async invalidateAll(): Promise<void> {
        await this.cacheService.invalidateTags(['ai-chat-conversations']);
        this.logger.log('All cached conversations invalidated');
    }
}
