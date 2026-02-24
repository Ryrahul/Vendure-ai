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
exports.ProductEmbeddingHandler = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const operators_1 = require("rxjs/operators");
const embedding_service_1 = require("../services/embedding.service");
const product_embedding_service_1 = require("../services/product-embedding.service");
/**
 * Subscribes to Product created/updated/deleted and keeps ProductEmbedding in sync.
 * On create/update: load product translations, build text (name + description), embed via OpenAI, upsert.
 * On delete: remove embedding row.
 */
let ProductEmbeddingHandler = class ProductEmbeddingHandler {
    constructor(eventBus, connection, embeddingService, productEmbeddingService) {
        this.eventBus = eventBus;
        this.connection = connection;
        this.embeddingService = embeddingService;
        this.productEmbeddingService = productEmbeddingService;
    }
    onModuleInit() {
        this.eventBus
            .ofType(core_1.ProductEvent)
            .pipe((0, operators_1.filter)((e) => e.type === 'created' || e.type === 'updated' || e.type === 'deleted'))
            .subscribe((event) => {
            if (event.type === 'deleted') {
                const productId = this.getProductId(event.entity);
                if (productId != null) {
                    this.productEmbeddingService.deleteByProductId(event.ctx, productId).catch((err) => {
                        console.error('[AiAssistantPlugin] Failed to delete embedding for product', productId, err);
                    });
                }
                return;
            }
            // created | updated
            this.embedProduct(event).catch((err) => {
                console.error('[AiAssistantPlugin] Failed to embed product', event.entity.id, err);
            });
        });
    }
    getProductId(product) {
        const id = product === null || product === void 0 ? void 0 : product.id;
        if (id == null)
            return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }
    async embedProduct(event) {
        var _a;
        const productId = this.getProductId(event.entity);
        if (productId == null)
            return;
        const productRepo = this.connection.rawConnection.getRepository(core_1.Product);
        const product = await productRepo.findOne({
            where: { id: productId },
            relations: ['translations'],
        });
        if (!((_a = product === null || product === void 0 ? void 0 : product.translations) === null || _a === void 0 ? void 0 : _a.length)) {
            return;
        }
        const text = buildProductText(product);
        if (!text.trim())
            return;
        const embedding = await this.embeddingService.embed(text);
        await this.productEmbeddingService.upsertEmbedding(event.ctx, productId, embedding);
    }
};
exports.ProductEmbeddingHandler = ProductEmbeddingHandler;
exports.ProductEmbeddingHandler = ProductEmbeddingHandler = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EventBus,
        core_1.TransactionalConnection,
        embedding_service_1.EmbeddingService,
        product_embedding_service_1.ProductEmbeddingService])
], ProductEmbeddingHandler);
function buildProductText(product) {
    const parts = [];
    for (const t of product.translations || []) {
        const name = t.name;
        const description = t.description;
        if (name)
            parts.push(String(name));
        if (description)
            parts.push(String(description));
    }
    return parts.join(' ').trim();
}
//# sourceMappingURL=product-embedding-handler.js.map