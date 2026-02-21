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

export interface AiAssistantPluginOptions {
    openaiApiKey: string;
    embeddingModel?: string;
}
