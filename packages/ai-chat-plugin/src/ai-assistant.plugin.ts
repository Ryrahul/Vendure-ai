import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { getMetadataArgsStorage } from 'typeorm';
import { ProductEmbedding } from './entities/product-embedding.entity';
import { VariantEmbedding } from './entities/variant-embedding.entity';
import { CollectionEmbedding } from './entities/collection-embedding.entity';
import { AiChatSession } from './entities/ai-chat-session.entity';
import { AiStoreProfile } from './entities/ai-store-profile.entity';
import { BusinessInsightsService } from './services/analytics/business-insights.service';
import { SalesAnalyticsService } from './services/analytics/sales-analytics.service';
import { StoreProfileService } from './services/analytics/store-profile.service';
import { EmbeddingService } from './services/embedding.service';
import { ProductEmbeddingService } from './services/product-embedding.service';
import { VariantEmbeddingService } from './services/variant-embedding.service';
import { CollectionEmbeddingService } from './services/collection-embedding.service';
import { AiChatService } from './services/ai-chat.service';
import { StorefrontApiService } from './services/storefront-api.service';
import { ConversationCacheService } from './services/conversation-cache.service';
import { ProductEmbeddingHandler } from './handlers/product-embedding-handler';
import { CollectionEmbeddingHandler } from './handlers/collection-embedding-handler';
import { EmbedAllJobService } from './services/embed-all-job.service';
import { EmbeddingSyncService } from './services/embedding-sync.service';
import { AiAssistantResolver } from './api/ai-assistant.resolver';
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { AdminChatController } from './controllers/admin-chat.controller';
import { AdminAiChatService } from './services/admin-ai-chat.service';
import { AdminConfirmationService } from './services/admin-confirmation.service';
import { ChatLimitsService } from './services/chat-limits.service';
import { AiChatHistoryService } from './services/ai-chat-history.service';
import { AI_ASSISTANT_OPTIONS, aiAdminAssistantPermission, EMBEDDING_DIMENSIONS, type AiAssistantPluginOptions } from './constants';
import { embedAllSchemaExtension } from './api/schema-extensions';

export type { AiAssistantPluginOptions } from './constants';

const defaultOptions: Required<Pick<AiAssistantPluginOptions, 'embeddingModel' | 'enableConversationCache'>> = {
    embeddingModel: 'text-embedding-3-small',
    enableConversationCache: true,
};

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductEmbedding, VariantEmbedding, CollectionEmbedding, AiChatSession, AiStoreProfile],
    adminApiExtensions: {
        schema: () => embedAllSchemaExtension,
        resolvers: [AiAssistantResolver],
    },
    controllers: [AiAssistantController, AdminChatController],
    providers: [
        { provide: AI_ASSISTANT_OPTIONS, useFactory: () => AiAssistantPlugin.options },
        EmbeddingService,
        ProductEmbeddingService,
        VariantEmbeddingService,
        CollectionEmbeddingService,
        StorefrontApiService,
        AiChatService,
        AdminAiChatService,
        AdminConfirmationService,
        ChatLimitsService,
        SalesAnalyticsService,
        BusinessInsightsService,
        StoreProfileService,
        AiChatHistoryService,
        ConversationCacheService,
        ProductEmbeddingHandler,
        CollectionEmbeddingHandler,
        EmbedAllJobService,
        EmbeddingSyncService,
    ],
    configuration: config => {
        config.authOptions.customPermissions.push(aiAdminAssistantPermission);
        return config;
    },
    compatibility: '^3.1.0',
})
export class AiAssistantPlugin implements OnApplicationBootstrap {
    static options: AiAssistantPluginOptions;

    static init(options: AiAssistantPluginOptions): typeof AiAssistantPlugin {
        this.options = { ...defaultOptions, ...options };
        // Model configuration is checked when the server/worker starts (the chat and embedding
        // services resolve their models then), not here: build tools such as the dashboard's
        // Vite plugin load this config without API keys.
        setEmbeddingDimensions(this.options.embeddingDimensions ?? EMBEDDING_DIMENSIONS);
        return AiAssistantPlugin;
    }

    constructor(
        private eventBus: EventBus,
        private productHandler: ProductEmbeddingHandler,
        private collectionHandler: CollectionEmbeddingHandler,
    ) {}

    onApplicationBootstrap() {
        void this.productHandler;
        void this.collectionHandler;
    }
}

/**
 * Sizes the pgvector `embedding` columns to the configured model. The entity decorators
 * run at import time with the default, so the column metadata is updated here, before
 * Vendure builds the database schema.
 */
function setEmbeddingDimensions(dimensions: number) {
    if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 16000) {
        throw new Error(`AiAssistantPlugin: embeddingDimensions must be an integer from 1 to 16000 (got ${dimensions})`);
    }
    const entities: Function[] = [ProductEmbedding, VariantEmbedding, CollectionEmbedding];
    for (const column of getMetadataArgsStorage().columns) {
        if (entities.includes(column.target as Function) && column.propertyName === 'embedding') {
            column.options.length = dimensions;
        }
    }
}
