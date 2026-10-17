import { PermissionDefinition } from '@vendure/core';

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
export function formatPrice(cents: number, currencyCode = 'USD'): string {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currencyCode}`;
    }
}

export interface AiAssistantPluginOptions {
    openaiApiKey: string;
    /**
     * Chat model used for shop and admin conversations.
     * @default 'gpt-4o-mini'
     */
    chatModel?: string;
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
    /**
     * Azure OpenAI configuration for chat completions.
     * When provided, chat services will use Azure OpenAI instead of direct OpenAI.
     * Also acts as a fallback if the primary OpenAI call fails.
     */
    azureOpenai?: {
        /** Azure OpenAI API key */
        apiKey: string;
        /** Azure resource name (e.g. "my-resource") */
        resourceName: string;
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
