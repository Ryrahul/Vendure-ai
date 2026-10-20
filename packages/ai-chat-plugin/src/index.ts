export { AiAssistantPlugin } from './ai-assistant.plugin';
export type { AiAssistantPluginOptions } from './ai-assistant.plugin';
export { ProductEmbedding } from './entities/product-embedding.entity';
export { VariantEmbedding } from './entities/variant-embedding.entity';
export { CollectionEmbedding } from './entities/collection-embedding.entity';
export { EmbeddingService } from './services/embedding.service';
export { ProductEmbeddingService } from './services/product-embedding.service';
export { VariantEmbeddingService } from './services/variant-embedding.service';
export { CollectionEmbeddingService } from './services/collection-embedding.service';
export { AiChatService } from './services/ai-chat.service';
export { AdminAiChatService } from './services/admin-ai-chat.service';
export { ConversationCacheService } from './services/conversation-cache.service';
export { AiChatHistoryService } from './services/ai-chat-history.service';
export { AiChatSession } from './entities/ai-chat-session.entity';
export type { AiChatMessageEntry } from './entities/ai-chat-session.entity';
export type { CachedConversation } from './services/conversation-cache.service';
export type { EmbeddingOptions } from './services/embedding.service';
export type { SimilarProductResult } from './services/product-embedding.service';
export type { SimilarVariantResult } from './services/variant-embedding.service';
export type { SimilarCollectionResult } from './services/collection-embedding.service';
export { AI_ASSISTANT_OPTIONS, EMBED_ALL_QUEUE_NAME, aiAdminAssistantPermission } from './constants';
export type { ChatLimitsOptions } from './constants';
export { StorefrontApiService } from './services/storefront-api.service';
export type { StorefrontProduct, StorefrontCollection, StorefrontSearchInput } from './services/storefront-api.service';
export { ADMIN_TOOL_PERMISSIONS, DEFAULT_ADMIN_TOOLS_REQUIRING_CONFIRMATION } from './services/admin-tool-permissions';
export { AdminConfirmationService } from './services/admin-confirmation.service';
export { ChatLimitsService } from './services/chat-limits.service';
export { AiStoreProfile } from './entities/ai-store-profile.entity';
export { SalesAnalyticsService } from './services/analytics/sales-analytics.service';
export { BusinessInsightsService } from './services/analytics/business-insights.service';
export { StoreProfileService } from './services/analytics/store-profile.service';
export { forecastSeries, backtest } from './services/analytics/forecast';
export { openAiWebSearch } from './services/analytics/web-search';
export type { WebSearchFunction, WebSearchLocation, WebSearchResult, WebSearchSource } from './services/analytics/web-search';
export type { InsightCard, InventoryPlanItem } from './services/analytics/insight-cards';
export type { PendingAdminAction, PendingAdminActionView } from './services/admin-confirmation.service';
export { AiAssistantController } from './controllers/ai-assistant.controller';
export { AdminChatController } from './controllers/admin-chat.controller';
export type { AdminChatRequest, AdminChatResponse, AdminConfirmRequest } from './controllers/admin-chat.controller';
export type {
    AiChatRequest,
    AiChatResponse,
    AiChatProduct,
    AddToCartAction,
    AiChatOrder,
    AiChatOrderLine,
    AiActiveOrder,
    AiCartLine,
    SetShippingAddressAction,
    SetBillingAddressAction,
    SetShippingMethodAction,
} from './controllers/ai-assistant.controller';
export type { AiPromotion, ApplyCouponAction, AiTokenUsage } from './services/types';
export type { AdminChatResult, AdminChatMeta, ConfirmedActionResult } from './services/admin-ai-chat.service';
export type { EmbedAllResult } from './generated/graphql';
