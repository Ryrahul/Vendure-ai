export declare const AI_ASSISTANT_OPTIONS: unique symbol;
export declare const EMBEDDING_DIMENSIONS = 1536;
export declare const EMBED_ALL_QUEUE_NAME = "embed-all";
/** Min cosine similarity (1 - distance) to consider a product relevant. Lower = more results (e.g. short queries like "laptops"). */
export declare const SIMILARITY_THRESHOLD = 0.28;
/** When first pass returns 0, we fallback to top-N without threshold. Only use fallback if best score >= this (avoids returning irrelevant results e.g. "private jets"). */
export declare const FALLBACK_MIN_SCORE = 0.25;
/** Max number of products to return in chat; only those above SIMILARITY_THRESHOLD are included. */
export declare const MAX_CHAT_PRODUCTS = 5;
/** Max number of Vendure collections to return in chat (e.g. "electronics", "sports"). */
export declare const MAX_CHAT_COLLECTIONS = 3;
/**
 * Format a price in the smallest currency unit (cents) to a human-readable dollar string.
 * Used in tool result summaries so the LLM sees formatted prices (e.g. "$42.63")
 * instead of raw cent values that it might misinterpret.
 */
export declare function formatPrice(cents: number): string;
export interface AiAssistantPluginOptions {
    openaiApiKey: string;
    embeddingModel?: string;
    /**
     * Base URL for product asset images. Should match your AssetServerPlugin's
     * public URL including the route, e.g. "https://my-vendure.com/assets/".
     * If not set, will be auto-detected from apiOptions (works for dev).
     */
    assetBaseUrl?: string;
    /**
     * Whether to cache conversation history server-side using Vendure's CacheService.
     *
     * When enabled, the frontend sends a `conversationId` with each request and the
     * server stores/retrieves conversation history from cache instead of requiring
     * the full message array in every request.
     *
     * Requires `DefaultCachePlugin` or `RedisCachePlugin` to be configured for
     * persistence across server restarts. Falls back to in-memory cache otherwise.
     *
     * @default true
     */
    enableConversationCache?: boolean;
}
//# sourceMappingURL=constants.d.ts.map