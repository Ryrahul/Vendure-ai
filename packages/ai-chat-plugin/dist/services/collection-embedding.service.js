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
exports.CollectionEmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const collection_embedding_entity_1 = require("../entities/collection-embedding.entity");
let CollectionEmbeddingService = class CollectionEmbeddingService {
    constructor(connection) {
        this.connection = connection;
    }
    async upsertEmbedding(ctx, collectionId, embedding) {
        var _a;
        await this.ensureRow(ctx, collectionId);
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + embedding.map((n) => Number(n)).join(',') + ']';
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        await conn.query(`UPDATE ${schema}.collection_embedding SET embedding = $1::vector, "updatedAt" = NOW() WHERE "collectionId" = $2`, [vectorStr, collectionId]);
    }
    async deleteByCollectionId(ctx, collectionId) {
        const repo = this.connection.rawConnection.getRepository(collection_embedding_entity_1.CollectionEmbedding);
        await repo.delete({ collectionId });
    }
    async findSimilar(ctx, queryEmbedding, limit = 5, minScore) {
        var _a;
        const conn = this.connection.rawConnection;
        const vectorStr = '[' + queryEmbedding.map((n) => Number(n)).join(',') + ']';
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        const hasThreshold = minScore != null && minScore > 0;
        const sql = hasThreshold
            ? `SELECT "collectionId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.collection_embedding
               WHERE embedding IS NOT NULL AND (1 - (embedding <=> $1::vector)) >= $3
               ORDER BY embedding <=> $1::vector LIMIT $2`
            : `SELECT "collectionId", 1 - (embedding <=> $1::vector) AS score
               FROM ${schema}.collection_embedding WHERE embedding IS NOT NULL
               ORDER BY embedding <=> $1::vector LIMIT $2`;
        const params = hasThreshold ? [vectorStr, limit, minScore] : [vectorStr, limit];
        const rows = await conn.query(sql, params);
        return rows.map((r) => ({
            collectionId: r.collectionId,
            score: Number(r.score),
        }));
    }
    async ensureRow(ctx, collectionId) {
        const repo = this.connection.rawConnection.getRepository(collection_embedding_entity_1.CollectionEmbedding);
        let row = await repo.findOne({ where: { collectionId } });
        if (!row) {
            row = repo.create({ collectionId });
            await repo.save(row);
        }
    }
};
exports.CollectionEmbeddingService = CollectionEmbeddingService;
exports.CollectionEmbeddingService = CollectionEmbeddingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.TransactionalConnection])
], CollectionEmbeddingService);
//# sourceMappingURL=collection-embedding.service.js.map