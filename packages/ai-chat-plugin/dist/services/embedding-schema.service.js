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
exports.EmbeddingSchemaService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@vendure/core");
const constants_1 = require("../constants");
/**
 * Ensures pgvector embedding columns exist on the embedding tables.
 * Runs once on module init so the plugin manages its own schema — no separate migration needed.
 */
let EmbeddingSchemaService = class EmbeddingSchemaService {
    constructor(connection) {
        this.connection = connection;
    }
    async onModuleInit() {
        var _a;
        const conn = this.connection.rawConnection;
        const schema = (_a = conn.options.schema) !== null && _a !== void 0 ? _a : 'public';
        const dim = constants_1.EMBEDDING_DIMENSIONS;
        try {
            await conn.query(`CREATE EXTENSION IF NOT EXISTS vector`);
        }
        catch (e) {
            // Extension might already exist or not be available
        }
        for (const table of ['product_embedding', 'variant_embedding', 'collection_embedding']) {
            try {
                await conn.query(`ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS embedding vector(${dim})`);
            }
            catch (e) {
                // Column might already exist; ignore
            }
        }
    }
};
exports.EmbeddingSchemaService = EmbeddingSchemaService;
exports.EmbeddingSchemaService = EmbeddingSchemaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.TransactionalConnection])
], EmbeddingSchemaService);
//# sourceMappingURL=embedding-schema.service.js.map