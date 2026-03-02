export const AI_ASSISTANT_OPTIONS = Symbol('AI_ASSISTANT_OPTIONS');
export const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small
export const EMBED_ALL_QUEUE_NAME = 'embed-all';

/** Min cosine similarity (1 - distance) to consider a product relevant. Lower = more results (e.g. short queries like "laptops"). */
export const SIMILARITY_THRESHOLD = 0.28;
/** When first pass returns 0, we fallback to top-N without threshold. Only use fallback if best score >= this (avoids returning irrelevant results e.g. "private jets"). */
export const FALLBACK_MIN_SCORE = 0.25;
/** Max number of products to return in chat; only those above SIMILARITY_THRESHOLD are included. */
export const MAX_CHAT_PRODUCTS = 5;
/** Max number of Vendure collections to return in chat (e.g. "electronics", "sports"). */
export const MAX_CHAT_COLLECTIONS = 3;

/**
 * Format a price in the smallest currency unit (cents) to a human-readable dollar string.
 * Used in tool result summaries so the LLM sees formatted prices (e.g. "$42.63")
 * instead of raw cent values that it might misinterpret.
 */
export function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

export interface AiAssistantPluginOptions {
    openaiApiKey: string;
    embeddingModel?: string;
    /**
     * Base URL for product asset images. Should match your AssetServerPlugin's
     * public URL including the route, e.g. "https://my-vendure.com/assets/".
     * If not set, will be auto-detected from apiOptions (works for dev).
     */
    assetBaseUrl?: string;
}
