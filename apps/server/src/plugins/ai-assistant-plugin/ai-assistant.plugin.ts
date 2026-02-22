import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { ProductEmbedding } from './entities/product-embedding.entity';
import { VariantEmbedding } from './entities/variant-embedding.entity';
import { CollectionEmbedding } from './entities/collection-embedding.entity';
import { EmbeddingService } from './services/embedding.service';
import { ProductEmbeddingService } from './services/product-embedding.service';
import { VariantEmbeddingService } from './services/variant-embedding.service';
import { CollectionEmbeddingService } from './services/collection-embedding.service';
import { AiChatService } from './services/ai-chat.service';
import { ProductEmbeddingHandler } from './handlers/product-embedding-handler';
import { VariantEmbeddingHandler } from './handlers/variant-embedding-handler';
import { CollectionEmbeddingHandler } from './handlers/collection-embedding-handler';
import { EmbedAllJobService } from './services/embed-all-job.service';
import { EmbeddingSchemaService } from './services/embedding-schema.service';
import { AiAssistantResolver } from './api/ai-assistant.resolver';
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { AI_ASSISTANT_OPTIONS, type AiAssistantPluginOptions } from './constants';
import { embedAllSchemaExtension } from './api/schema-extensions';

export type { AiAssistantPluginOptions } from './constants';

const defaultOptions: Required<Pick<AiAssistantPluginOptions, 'embeddingModel'>> = {
    embeddingModel: 'text-embedding-3-small',
};

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductEmbedding, VariantEmbedding, CollectionEmbedding],
    adminApiExtensions: {
        schema: () => embedAllSchemaExtension,
        resolvers: [AiAssistantResolver],
    },
    controllers: [AiAssistantController],
    providers: [
        { provide: AI_ASSISTANT_OPTIONS, useFactory: () => AiAssistantPlugin.options },
        EmbeddingService,
        ProductEmbeddingService,
        VariantEmbeddingService,
        CollectionEmbeddingService,
        AiChatService,
        ProductEmbeddingHandler,
        VariantEmbeddingHandler,
        CollectionEmbeddingHandler,
        EmbeddingSchemaService,
        EmbedAllJobService,
    ],
    compatibility: '^3.0.0',
})
export class AiAssistantPlugin implements OnApplicationBootstrap {
    static options: AiAssistantPluginOptions;

    static init(options: AiAssistantPluginOptions): typeof AiAssistantPlugin {
        this.options = { ...defaultOptions, ...options };
        return AiAssistantPlugin;
    }

    constructor(
        private eventBus: EventBus,
        private productHandler: ProductEmbeddingHandler,
        private variantHandler: VariantEmbeddingHandler,
        private collectionHandler: CollectionEmbeddingHandler,
    ) {}

    onApplicationBootstrap() {
        void this.productHandler;
        void this.variantHandler;
        void this.collectionHandler;
    }
}
