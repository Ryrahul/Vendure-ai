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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionEmbeddingHandler = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const operators_1 = require("rxjs/operators");
const embedding_service_1 = require("../services/embedding.service");
const collection_embedding_service_1 = require("../services/collection-embedding.service");
/**
 * Subscribes to Collection created/updated/deleted; keeps CollectionEmbedding in sync.
 */
let CollectionEmbeddingHandler = class CollectionEmbeddingHandler {
    constructor(eventBus, connection, embeddingService, collectionEmbeddingService) {
        this.eventBus = eventBus;
        this.connection = connection;
        this.embeddingService = embeddingService;
        this.collectionEmbeddingService = collectionEmbeddingService;
    }
    onModuleInit() {
        this.eventBus
            .ofType(core_1.CollectionEvent)
            .pipe((0, operators_1.filter)((e) => e.type === 'created' || e.type === 'updated' || e.type === 'deleted'))
            .subscribe((event) => {
            if (event.type === 'deleted') {
                const id = this.getCollectionId(event.entity);
                if (id != null)
                    this.collectionEmbeddingService
                        .deleteByCollectionId(event.ctx, id)
                        .catch((err) => console.error('[AiAssistantPlugin] Failed to delete collection embedding', id, err));
                return;
            }
            this.embedCollection(event).catch((err) => {
                var _a;
                return console.error('[AiAssistantPlugin] Failed to embed collection', (_a = event.entity) === null || _a === void 0 ? void 0 : _a.id, err);
            });
        });
    }
    getCollectionId(c) {
        const id = c === null || c === void 0 ? void 0 : c.id;
        if (id == null)
            return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }
    async embedCollection(event) {
        var _a;
        const collectionId = this.getCollectionId(event.entity);
        if (collectionId == null)
            return;
        const repo = this.connection.rawConnection.getRepository(core_1.Collection);
        const collection = await repo.findOne({
            where: { id: collectionId },
            relations: ['translations'],
        });
        if (!((_a = collection === null || collection === void 0 ? void 0 : collection.translations) === null || _a === void 0 ? void 0 : _a.length))
            return;
        const text = buildCollectionText(collection);
        if (!text.trim())
            return;
        const embedding = await this.embeddingService.embed(text);
        await this.collectionEmbeddingService.upsertEmbedding(event.ctx, collectionId, embedding);
    }
};
exports.CollectionEmbeddingHandler = CollectionEmbeddingHandler;
exports.CollectionEmbeddingHandler = CollectionEmbeddingHandler = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EventBus,
        core_1.TransactionalConnection,
        embedding_service_1.EmbeddingService,
        collection_embedding_service_1.CollectionEmbeddingService])
], CollectionEmbeddingHandler);
function buildCollectionText(collection) {
    const parts = [];
    for (const t of collection.translations || []) {
        if (t === null || t === void 0 ? void 0 : t.name)
            parts.push(String(t.name));
        if (t === null || t === void 0 ? void 0 : t.description)
            parts.push(String(t.description));
    }
    return parts.join(' ').trim();
}
//# sourceMappingURL=collection-embedding-handler.js.map