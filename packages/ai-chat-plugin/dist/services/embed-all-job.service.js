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
exports.EmbedAllJobService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const constants_1 = require("../constants");
const embedding_service_1 = require("./embedding.service");
const product_embedding_service_1 = require("./product-embedding.service");
const variant_embedding_service_1 = require("./variant-embedding.service");
const collection_embedding_service_1 = require("./collection-embedding.service");
/**
 * Creates the embed-all job queue and processes it: loads all products, variants, collections
 * and generates/upserts embeddings in the background.
 */
let EmbedAllJobService = class EmbedAllJobService {
    constructor(jobQueueService, requestContextService, connection, embeddingService, productEmbeddingService, variantEmbeddingService, collectionEmbeddingService) {
        this.jobQueueService = jobQueueService;
        this.requestContextService = requestContextService;
        this.connection = connection;
        this.embeddingService = embeddingService;
        this.productEmbeddingService = productEmbeddingService;
        this.variantEmbeddingService = variantEmbeddingService;
        this.collectionEmbeddingService = collectionEmbeddingService;
    }
    async onModuleInit() {
        this.jobQueue = await this.jobQueueService.createQueue({
            name: constants_1.EMBED_ALL_QUEUE_NAME,
            process: async () => {
                const ctx = await this.requestContextService.create({
                    apiType: 'admin',
                });
                await this.runEmbedAll(ctx);
            },
        });
    }
    async enqueue() {
        const job = await this.jobQueue.add({});
        return { jobId: String(job.id) };
    }
    async runEmbedAll(ctx) {
        const reqCtx = ctx;
        const conn = this.connection.rawConnection;
        const productRepo = conn.getRepository(core_1.Product);
        const variantRepo = conn.getRepository(core_1.ProductVariant);
        const collectionRepo = conn.getRepository(core_1.Collection);
        const products = await productRepo.find({
            relations: ['translations'],
        });
        for (const product of products) {
            const text = buildProductText(product);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.productEmbeddingService.upsertEmbedding(reqCtx, product.id, embedding);
                }
                catch (e) {
                    console.error('[AiAssistantPlugin] embed-all product', product.id, e);
                }
            }
        }
        const variants = await variantRepo.find({
            relations: ['translations', 'product', 'product.translations'],
        });
        for (const variant of variants) {
            const text = buildVariantText(variant);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.variantEmbeddingService.upsertEmbedding(reqCtx, variant.id, embedding);
                }
                catch (e) {
                    console.error('[AiAssistantPlugin] embed-all variant', variant.id, e);
                }
            }
        }
        const collections = await collectionRepo.find({
            relations: ['translations'],
        });
        for (const collection of collections) {
            const text = buildCollectionText(collection);
            if (text.trim()) {
                try {
                    const embedding = await this.embeddingService.embed(text);
                    await this.collectionEmbeddingService.upsertEmbedding(reqCtx, collection.id, embedding);
                }
                catch (e) {
                    console.error('[AiAssistantPlugin] embed-all collection', collection.id, e);
                }
            }
        }
    }
};
exports.EmbedAllJobService = EmbedAllJobService;
exports.EmbedAllJobService = EmbedAllJobService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.JobQueueService,
        core_1.RequestContextService,
        core_1.TransactionalConnection,
        embedding_service_1.EmbeddingService,
        product_embedding_service_1.ProductEmbeddingService,
        variant_embedding_service_1.VariantEmbeddingService,
        collection_embedding_service_1.CollectionEmbeddingService])
], EmbedAllJobService);
function buildProductText(product) {
    const parts = [];
    for (const t of product.translations || []) {
        if (t === null || t === void 0 ? void 0 : t.name)
            parts.push(String(t.name));
        if (t === null || t === void 0 ? void 0 : t.description)
            parts.push(String(t.description));
    }
    return parts.join(' ').trim();
}
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
//# sourceMappingURL=embed-all-job.service.js.map