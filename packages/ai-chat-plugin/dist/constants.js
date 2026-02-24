"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CHAT_COLLECTIONS = exports.MAX_CHAT_PRODUCTS = exports.FALLBACK_MIN_SCORE = exports.SIMILARITY_THRESHOLD = exports.EMBED_ALL_QUEUE_NAME = exports.EMBEDDING_DIMENSIONS = exports.AI_ASSISTANT_OPTIONS = void 0;
exports.AI_ASSISTANT_OPTIONS = Symbol('AI_ASSISTANT_OPTIONS');
exports.EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small
exports.EMBED_ALL_QUEUE_NAME = 'embed-all';
/** Min cosine similarity (1 - distance) to consider a product relevant. Lower = more results (e.g. short queries like "laptops"). */
exports.SIMILARITY_THRESHOLD = 0.28;
/** When first pass returns 0, we fallback to top-N without threshold. Only use fallback if best score >= this (avoids returning irrelevant results e.g. "private jets"). */
exports.FALLBACK_MIN_SCORE = 0.25;
/** Max number of products to return in chat; only those above SIMILARITY_THRESHOLD are included. */
exports.MAX_CHAT_PRODUCTS = 5;
/** Max number of Vendure collections to return in chat (e.g. "electronics", "sports"). */
exports.MAX_CHAT_COLLECTIONS = 3;
//# sourceMappingURL=constants.js.map