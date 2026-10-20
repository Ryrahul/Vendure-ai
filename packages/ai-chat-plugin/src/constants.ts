import { PermissionDefinition } from '@vendure/core';

import type { EmbeddingModel, LanguageModel } from 'ai';

import type { WebSearchFunction } from './services/analytics/web-search';

export const AI_ASSISTANT_OPTIONS = Symbol('AI_ASSISTANT_OPTIONS');
/** Default vector size (text-embedding-3-small). Override with `embeddingDimensions`. */
export const EMBEDDING_DIMENSIONS = 1536;
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
export function formatPrice(cents: number, currencyCode = 'USD'): string {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currencyCode}`;
    }
}

export interface ChatLimitsOptions {
    /** Messages per minute per shopper (customer, else session). 0 disables. @default 20 */
    shopMessagesPerMinute?: number;
    /** Messages per minute per IP address across all shoppers on it. 0 disables. @default 60 */
    shopMessagesPerMinutePerIp?: number;
    /** Model tokens (input + output) per shopper per UTC day. 0 disables. @default 200000 */
    shopTokensPerDay?: number;
    /** Messages per minute per administrator. 0 disables. @default 30 */
    adminMessagesPerMinute?: number;
    /** Model tokens per administrator per UTC day. 0 disables. @default 1000000 */
    adminTokensPerDay?: number;
}

export interface AiAssistantPluginOptions {
    /**
     * OpenAI API key. Used for the chat model, embeddings and web search unless you
     * configure other providers below. Optional when `chatModel` / `azureOpenai` and
     * `embeddingModel` / `embedTexts` cover everything.
     */
    openaiApiKey?: string;
    /**
     * Chat model used for shop and admin conversations: an OpenAI model name (used with
     * `openaiApiKey`), or any AI SDK model instance, e.g. Anthropic, Google, Mistral, or a
     * self-hosted OpenAI-compatible server (Ollama, vLLM, LM Studio, DeepSeek, OpenRouter):
     *
     * ```ts
     * import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
     * const local = createOpenAICompatible({ name: 'ollama', baseURL: 'http://localhost:11434/v1' });
     * AiAssistantPlugin.init({ chatModel: local('qwen3:14b'), ... })
     * ```
     *
     * The model must support tool calling.
     * @default 'gpt-4o-mini'
     */
    chatModel?: string | LanguageModel;
    /**
     * URL of this server's Shop API, used for product search and catalog lookups so
     * that whatever search plugin is configured (DefaultSearchPlugin, Elasticsearch,
     * Typesense, Meilisearch, …) is used, with the storefront's visibility rules.
     *
     * Defaults to `http://127.0.0.1:<apiOptions.port>/<apiOptions.shopApiPath>`. Set it
     * when the server is not reachable on that address from itself.
     */
    shopApiUrl?: string;
    /**
     * Whether the shop assistant may reveal promotion coupon codes to shoppers.
     * When false, it tells shoppers a code is required but never discloses it.
     * @default false
     */
    exposeCouponCodes?: boolean;
    /**
     * Maximum length (characters) of a single shopper message; longer messages are rejected.
     * @default 2000
     */
    maxMessageLength?: number;
    /**
     * Maximum number of previous messages sent to the model per turn.
     * @default 20
     */
    maxHistoryMessages?: number;
    /**
     * Admin tools that the assistant may only *request*: they run after the administrator
     * presses Confirm in the dashboard. Defaults to every delete plus changes to
     * administrators, roles, channels, global settings and payment methods
     * (see DEFAULT_ADMIN_TOOLS_REQUIRING_CONFIRMATION). Pass `[]` to disable.
     */
    adminToolsRequiringConfirmation?: string[];
    /**
     * Message rate limits and daily token budgets for shoppers and administrators.
     * Exceeding them returns HTTP 429. Set a value to 0 to disable that limit.
     */
    limits?: ChatLimitsOptions;
    /**
     * Let the admin assistant search the web and read public web pages for competitor and
     * market research. By default searches use OpenAI's built-in web search with
     * `openaiApiKey`, or — without it — the Azure deployment's web search (`azureOpenai`);
     * both are billed by the provider per search call.
     * @default true
     */
    enableWebResearch?: boolean;
    /**
     * Your own web search for the admin assistant (e.g. Tavily, Brave, SerpAPI), used
     * instead of OpenAI's web search. Return findings as text plus their source URLs.
     */
    webSearch?: WebSearchFunction;
    /**
     * Embedding model for semantic product search: an OpenAI model name (used with
     * `openaiApiKey`) or any AI SDK embedding model instance, e.g.
     * `createAzure({...}).textEmbeddingModel('my-deployment')` or
     * `createOpenAICompatible({...}).textEmbeddingModel('nomic-embed-text')`.
     * Set `embeddingDimensions` to match the model.
     * @default 'text-embedding-3-small'
     */
    embeddingModel?: string | EmbeddingModel;
    /**
     * Your own embedding function, used instead of `embeddingModel` — for any provider or
     * in-house service. Must return one vector of `embeddingDimensions` numbers per text,
     * in input order.
     */
    embedTexts?: (texts: string[]) => Promise<number[][]>;
    /**
     * Size of the embedding vectors (the pgvector column size). Must match the model:
     * 1536 for text-embedding-3-small, 3072 for text-embedding-3-large, 768 for
     * nomic-embed-text, … Changing it recreates the embedding columns (with
     * `synchronize`, or in your next migration); run "Embed all" afterwards.
     * @default 1536
     */
    embeddingDimensions?: number;
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
    /**
     * Azure OpenAI chat deployment. Without `openaiApiKey` (and without a `chatModel`
     * instance) it is the chat model; next to another chat model it is the fallback
     * when that model's call fails. For Azure embeddings pass
     * `createAzure({...}).textEmbeddingModel(...)` as `embeddingModel`.
     */
    azureOpenai?: {
        /** Azure OpenAI API key */
        apiKey: string;
        /** Azure resource name (e.g. "my-resource"). Either this or `baseURL`. */
        resourceName?: string;
        /** Full endpoint instead of `resourceName`, e.g. "https://x.services.ai.azure.com/openai". */
        baseURL?: string;
        /** API version, when your deployment needs a specific one. */
        apiVersion?: string;
        /** Azure deployment name (e.g. "gpt-4.1") */
        deploymentName: string;
    };
}

/**
 * Required to use the AI admin assistant. SuperAdmins have it automatically; grant it to
 * other roles explicitly. Each admin tool additionally requires the same permission as the
 * equivalent Admin API operation (see admin-tool-permissions.ts).
 */
export const aiAdminAssistantPermission = new PermissionDefinition({
    name: 'UseAiAdminAssistant',
    description: 'Allows using the AI admin assistant in the Dashboard',
});

export type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string };

/**
 * Client-supplied history is untrusted: keep only user/assistant turns with string
 * content (a client must never be able to inject a `system` message), cap each message
 * and keep only the most recent turns.
 */
export function sanitizeHistory(history: unknown, maxMessages: number, maxLength = 8000): ChatHistoryEntry[] {
    if (!Array.isArray(history)) {
        return [];
    }
    return history
        .filter(
            (m): m is ChatHistoryEntry =>
                !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0,
        )
        .map(m => ({ role: m.role, content: m.content.slice(0, maxLength) }))
        .slice(-maxMessages);
}
