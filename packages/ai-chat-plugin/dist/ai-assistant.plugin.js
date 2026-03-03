"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AiAssistantPlugin_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiAssistantPlugin = void 0;
const core_1 = require("@vendure/core");
const product_embedding_entity_1 = require("./entities/product-embedding.entity");
const variant_embedding_entity_1 = require("./entities/variant-embedding.entity");
const collection_embedding_entity_1 = require("./entities/collection-embedding.entity");
const embedding_service_1 = require("./services/embedding.service");
const product_embedding_service_1 = require("./services/product-embedding.service");
const variant_embedding_service_1 = require("./services/variant-embedding.service");
const collection_embedding_service_1 = require("./services/collection-embedding.service");
const ai_chat_service_1 = require("./services/ai-chat.service");
const conversation_cache_service_1 = require("./services/conversation-cache.service");
const product_embedding_handler_1 = require("./handlers/product-embedding-handler");
const variant_embedding_handler_1 = require("./handlers/variant-embedding-handler");
const collection_embedding_handler_1 = require("./handlers/collection-embedding-handler");
const embed_all_job_service_1 = require("./services/embed-all-job.service");
const ai_assistant_resolver_1 = require("./api/ai-assistant.resolver");
const ai_assistant_controller_1 = require("./controllers/ai-assistant.controller");
const constants_1 = require("./constants");
const schema_extensions_1 = require("./api/schema-extensions");
const defaultOptions = {
    embeddingModel: 'text-embedding-3-small',
    enableConversationCache: true,
};
let AiAssistantPlugin = AiAssistantPlugin_1 = class AiAssistantPlugin {
    static init(options) {
        this.options = { ...defaultOptions, ...options };
        return AiAssistantPlugin_1;
    }
    constructor(eventBus, productHandler, variantHandler, collectionHandler) {
        this.eventBus = eventBus;
        this.productHandler = productHandler;
        this.variantHandler = variantHandler;
        this.collectionHandler = collectionHandler;
    }
    onApplicationBootstrap() {
        void this.productHandler;
        void this.variantHandler;
        void this.collectionHandler;
    }
};
exports.AiAssistantPlugin = AiAssistantPlugin;
exports.AiAssistantPlugin = AiAssistantPlugin = AiAssistantPlugin_1 = __decorate([
    (0, core_1.VendurePlugin)({
        imports: [core_1.PluginCommonModule],
        entities: [product_embedding_entity_1.ProductEmbedding, variant_embedding_entity_1.VariantEmbedding, collection_embedding_entity_1.CollectionEmbedding],
        adminApiExtensions: {
            schema: () => schema_extensions_1.embedAllSchemaExtension,
            resolvers: [ai_assistant_resolver_1.AiAssistantResolver],
        },
        controllers: [ai_assistant_controller_1.AiAssistantController],
        providers: [
            { provide: constants_1.AI_ASSISTANT_OPTIONS, useFactory: () => AiAssistantPlugin.options },
            embedding_service_1.EmbeddingService,
            product_embedding_service_1.ProductEmbeddingService,
            variant_embedding_service_1.VariantEmbeddingService,
            collection_embedding_service_1.CollectionEmbeddingService,
            ai_chat_service_1.AiChatService,
            conversation_cache_service_1.ConversationCacheService,
            product_embedding_handler_1.ProductEmbeddingHandler,
            variant_embedding_handler_1.VariantEmbeddingHandler,
            collection_embedding_handler_1.CollectionEmbeddingHandler,
            embed_all_job_service_1.EmbedAllJobService,
        ],
        compatibility: '^3.0.0',
    }),
    __metadata("design:paramtypes", [core_1.EventBus,
        product_embedding_handler_1.ProductEmbeddingHandler,
        variant_embedding_handler_1.VariantEmbeddingHandler,
        collection_embedding_handler_1.CollectionEmbeddingHandler])
], AiAssistantPlugin);
//# sourceMappingURL=ai-assistant.plugin.js.map