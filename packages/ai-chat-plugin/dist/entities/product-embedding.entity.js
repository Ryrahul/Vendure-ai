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
exports.ProductEmbedding = void 0;
const typeorm_1 = require("typeorm");
const core_1 = require("@vendure/core");
const constants_1 = require("../constants");
/**
 * Stores vector embedding for a Product (name + description) for semantic search.
 * Embedding column is declared so TypeORM schema sync (synchronize: false) does not suggest dropping it;
 * actual read/write is via raw SQL in ProductEmbeddingService.
 */
let ProductEmbedding = class ProductEmbedding extends core_1.VendureEntity {
    constructor(input) {
        super(input);
    }
};
exports.ProductEmbedding = ProductEmbedding;
__decorate([
    (0, typeorm_1.ManyToOne)(() => core_1.Product, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)(),
    __metadata("design:type", core_1.Product)
], ProductEmbedding.prototype, "product", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], ProductEmbedding.prototype, "productId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'vector', length: constants_1.EMBEDDING_DIMENSIONS, select: false, nullable: true }),
    __metadata("design:type", String)
], ProductEmbedding.prototype, "embedding", void 0);
exports.ProductEmbedding = ProductEmbedding = __decorate([
    (0, typeorm_1.Entity)('product_embedding'),
    __metadata("design:paramtypes", [Object])
], ProductEmbedding);
//# sourceMappingURL=product-embedding.entity.js.map