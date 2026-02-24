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
exports.ProductEmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const product_embedding_entity_1 = require("../entities/product-embedding.entity");
/**
 * Persists and queries product embeddings using pgvector (raw SQL).
 * Table must have embedding vector(1536); migration creates it.
 */
let ProductEmbeddingService = class ProductEmbeddingService {
    constructor(connection) {
        this.connection = connection;
    }
    async upsertEmbedding(ctx, productId, embedding) {
        var _a;
        await this.ensureRow(ctx, productId);
        const conn = this.connection.rawConnection;
        const vectorStr = toVectorStr(embedding);
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        await conn.query(`UPDATE ${schema}.product_embedding SET embedding = $1::vector, "updatedAt" = NOW() WHERE "productId" = $2`, [vectorStr, productId]);
    }
    async deleteByProductId(ctx, productId) {
        const repo = this.connection.rawConnection.getRepository(product_embedding_entity_1.ProductEmbedding);
        await repo.delete({ productId });
    }
    async findSimilar(ctx, queryEmbedding, limit = 10, minScore) {
        var _a;
        const conn = this.connection.rawConnection;
        const vectorStr = toVectorStr(queryEmbedding);
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        const hasThreshold = minScore != null && minScore > 0;
        const sql = hasThreshold
            ? `SELECT "productId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.product_embedding
               WHERE embedding IS NOT NULL AND (1 - (embedding <=> $1::vector)) >= $3
               ORDER BY embedding <=> $1::vector
               LIMIT $2`
            : `SELECT "productId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.product_embedding
               WHERE embedding IS NOT NULL
               ORDER BY embedding <=> $1::vector
               LIMIT $2`;
        const params = hasThreshold ? [vectorStr, limit, minScore] : [vectorStr, limit];
        const rows = await conn.query(sql, params);
        return rows.map((r) => ({
            productId: r.productId,
            score: Number(r.score),
        }));
    }
    /** Ensure row exists (for migration that creates table with no embedding column initially). */
    async ensureRow(ctx, productId) {
        const repo = this.connection.rawConnection.getRepository(product_embedding_entity_1.ProductEmbedding);
        let row = await repo.findOne({ where: { productId } });
        if (!row) {
            row = repo.create({ productId });
            await repo.save(row);
        }
    }
};
exports.ProductEmbeddingService = ProductEmbeddingService;
exports.ProductEmbeddingService = ProductEmbeddingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.TransactionalConnection])
], ProductEmbeddingService);
function toVectorStr(arr) {
    return '[' + arr.map((n) => Number(n)).join(',') + ']';
}
//# sourceMappingURL=product-embedding.service.js.map