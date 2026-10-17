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
export { StorefrontApiService } from './services/storefront-api.service';
export type { StorefrontProduct, StorefrontCollection, StorefrontSearchInput } from './services/storefront-api.service';
export { ADMIN_TOOL_PERMISSIONS } from './services/admin-tool-permissions';
export { AiAssistantController } from './controllers/ai-assistant.controller';
export { AdminChatController } from './controllers/admin-chat.controller';
export type { AdminChatRequest, AdminChatResponse } from './controllers/admin-chat.controller';
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
export type { AdminChatResult } from './services/admin-ai-chat.service';
export type { EmbedAllResult } from './generated/graphql';
