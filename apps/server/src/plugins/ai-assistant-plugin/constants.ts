export const AI_ASSISTANT_OPTIONS = Symbol('AI_ASSISTANT_OPTIONS');
export const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small
export const EMBED_ALL_QUEUE_NAME = 'embed-all';

/** Min cosine similarity (1 - distance) to consider a product relevant. Tune if too strict/loose. */
export const SIMILARITY_THRESHOLD = 0.4;
/** Max number of products to return in chat; only those above SIMILARITY_THRESHOLD are included. */
export const MAX_CHAT_PRODUCTS = 5;

export interface AiAssistantPluginOptions {
    openaiApiKey: string;
    embeddingModel?: string;
}
