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
exports.VariantEmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const variant_embedding_entity_1 = require("../entities/variant-embedding.entity");
let VariantEmbeddingService = class VariantEmbeddingService {
    constructor(connection) {
        this.connection = connection;
    }
    async upsertEmbedding(ctx, productVariantId, embedding) {
        var _a;
        await this.ensureRow(ctx, productVariantId);
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + embedding.map((n) => Number(n)).join(',') + ']';
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        await conn.query(`UPDATE ${schema}.variant_embedding SET embedding = $1::vector, "updatedAt" = NOW() WHERE "productVariantId" = $2`, [vectorStr, productVariantId]);
    }
    async deleteByVariantId(ctx, productVariantId) {
        const repo = this.connection.rawConnection.getRepository(variant_embedding_entity_1.VariantEmbedding);
        await repo.delete({ productVariantId });
    }
    async findSimilar(ctx, queryEmbedding, limit = 5) {
        var _a;
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + queryEmbedding.map((n) => Number(n)).join(',') + ']';
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        const rows = await conn.query(`SELECT "productVariantId", 1 - (embedding <=> $1::vector) AS score
             FROM ${schema}.variant_embedding WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector LIMIT $2`, [vectorStr, limit]);
        return rows.map((r) => ({
            productVariantId: r.productVariantId,
            score: Number(r.score),
        }));
    }
    async ensureRow(ctx, productVariantId) {
        const repo = this.connection.rawConnection.getRepository(variant_embedding_entity_1.VariantEmbedding);
        let row = await repo.findOne({ where: { productVariantId } });
        if (!row) {
            row = repo.create({ productVariantId });
            await repo.save(row);
        }
    }
};
exports.VariantEmbeddingService = VariantEmbeddingService;
exports.VariantEmbeddingService = VariantEmbeddingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.TransactionalConnection])
], VariantEmbeddingService);
//# sourceMappingURL=variant-embedding.service.js.map