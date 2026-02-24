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
exports.VariantEmbeddingHandler = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const operators_1 = require("rxjs/operators");
const embedding_service_1 = require("../services/embedding.service");
const variant_embedding_service_1 = require("../services/variant-embedding.service");
/**
 * Subscribes to ProductVariant created/updated/deleted; keeps VariantEmbedding in sync.
 * Variant is the add-to-cart unit (Phase 2); embedding enables discovery by intent.
 */
let VariantEmbeddingHandler = class VariantEmbeddingHandler {
    constructor(eventBus, connection, embeddingService, variantEmbeddingService) {
        this.eventBus = eventBus;
        this.connection = connection;
        this.embeddingService = embeddingService;
        this.variantEmbeddingService = variantEmbeddingService;
    }
    onModuleInit() {
        this.eventBus
            .ofType(core_1.ProductVariantEvent)
            .pipe((0, operators_1.filter)((e) => e.type === 'created' || e.type === 'updated' || e.type === 'deleted'))
            .subscribe((event) => {
            const variants = Array.isArray(event.entity) ? event.entity : [event.entity];
            if (event.type === 'deleted') {
                for (const v of variants) {
                    const id = this.getId(v);
                    if (id != null)
                        this.variantEmbeddingService
                            .deleteByVariantId(event.ctx, id)
                            .catch((err) => console.error('[AiAssistantPlugin] Failed to delete variant embedding', id, err));
                }
                return;
            }
            for (const v of variants) {
                this.embedVariant(event.ctx, v).catch((err) => console.error('[AiAssistantPlugin] Failed to embed variant', v === null || v === void 0 ? void 0 : v.id, err));
            }
        });
    }
    getId(v) {
        const id = v === null || v === void 0 ? void 0 : v.id;
        if (id == null)
            return null;
        return typeof id === 'number' ? id : parseInt(String(id), 10);
    }
    async embedVariant(ctx, variant) {
        const variantId = this.getId(variant);
        if (variantId == null)
            return;
        const conn = this.connection.rawConnection;
        const variantRepo = conn.getRepository(core_1.ProductVariant);
        const v = await variantRepo.findOne({
            where: { id: variantId },
            relations: ['translations', 'product', 'product.translations'],
        });
        if (!v)
            return;
        const text = buildVariantText(v);
        if (!text.trim())
            return;
        const embedding = await this.embeddingService.embed(text);
        await this.variantEmbeddingService.upsertEmbedding(ctx, variantId, embedding);
    }
};
exports.VariantEmbeddingHandler = VariantEmbeddingHandler;
exports.VariantEmbeddingHandler = VariantEmbeddingHandler = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.EventBus,
        core_1.TransactionalConnection,
        embedding_service_1.EmbeddingService,
        variant_embedding_service_1.VariantEmbeddingService])
], VariantEmbeddingHandler);
function buildVariantText(variant) {
    const parts = [];
    for (const t of variant.translations || []) {
        if (t === null || t === void 0 ? void 0 : t.name)
            parts.push(String(t.name));
    }
    const sku = variant.sku;
    if (sku)
        parts.push(sku);
    if (variant.product) {
        for (const pt of variant.product
            .translations || []) {
            if (pt === null || pt === void 0 ? void 0 : pt.name)
                parts.push(String(pt.name));
        }
    }
    return parts.join(' ').trim();
}
//# sourceMappingURL=variant-embedding-handler.js.map