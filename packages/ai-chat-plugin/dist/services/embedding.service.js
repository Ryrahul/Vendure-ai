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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = __importDefault(require("openai"));
const constants_1 = require("../constants");
/**
 * Generates text embeddings using OpenAI's embedding API.
 * Used to embed product name + description for semantic search.
 */
let EmbeddingService = class EmbeddingService {
    constructor(options) {
        var _a;
        this.client = new openai_1.default({ apiKey: options.openaiApiKey });
        this.model = (_a = options.embeddingModel) !== null && _a !== void 0 ? _a : 'text-embedding-3-small';
    }
    /**
     * Generate embedding vector for the given text.
     * @returns Array of numbers (e.g. 1536 dims for text-embedding-3-small)
     */
    async embed(text) {
        var _a;
        if (!(text === null || text === void 0 ? void 0 : text.trim())) {
            throw new Error('EmbeddingService.embed: text is required');
        }
        const response = await this.client.embeddings.create({
            model: this.model,
            input: text.trim().slice(0, 8191), // model limit
        });
        const embedding = (_a = response.data[0]) === null || _a === void 0 ? void 0 : _a.embedding;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('EmbeddingService.embed: no embedding in response');
        }
        return embedding;
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(constants_1.AI_ASSISTANT_OPTIONS)),
    __metadata("design:paramtypes", [Object])
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map