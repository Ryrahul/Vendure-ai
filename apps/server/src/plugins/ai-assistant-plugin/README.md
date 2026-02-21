# AiAssistantPlugin

Implements **Vendure AI Commerce Agent – Phase 1** (see `AGENT.md`): embeddings for products, variants, and collections; pgvector for similarity search; event-driven updates; and a background job to embed all.

## Features

- **OpenAI embeddings** for Product (name + description), ProductVariant (name, sku, product name), and Collection (name, description). Variant focus supports Phase 2 add-to-cart by variant ID.
- **pgvector**: embedding stored in `vector(1536)`; similarity via `<=>` (cosine distance).
- **Event subscription**: ProductEvent, ProductVariantEvent, CollectionEvent (created/updated/deleted) — embeddings created, updated, or removed.
- **Admin mutation `triggerEmbedAll`**: enqueues a background job that embeds all products, variants, and collections.

## Options (from `init()` only)

All options are taken from `AiAssistantPlugin.init({ ... })`. No env fallback for the API key.

| Option           | Type   | Required | Default                     | Description                    |
|------------------|--------|----------|-----------------------------|--------------------------------|
| `openaiApiKey`   | string | **Yes**  | —                           | OpenAI API key for embeddings. |
| `embeddingModel` | string | No       | `'text-embedding-3-small'`  | OpenAI embedding model name.   |

## Setup

1. **Config** — pass `openaiApiKey` in init:
   ```ts
   AiAssistantPlugin.init({
     openaiApiKey: process.env.OPENAI_API_KEY ?? '',
     embeddingModel: 'text-embedding-3-small',
   }),
   ```

2. **Database**
   - Enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;` (once per DB).
   - Generate migration for the new entities (product_embedding, variant_embedding, collection_embedding), then run the migration that adds the `embedding vector(1536)` columns (see `src/migrations/`).
   ```bash
   npx vendure migrate
   ```

3. **Trigger full re-embed** (Admin API):
   ```graphql
   mutation { triggerEmbedAll { jobId message } }
   ```

4. **REST: talk to the AI buddy**  
   `POST /ai-assistant/chat` with body `{ "message": "gift for dad" }`.  
   Returns `{ message: string, products: [{ id, name, slug, price, image }] }` (vector search over product embeddings).

## Exports

- `AiAssistantPlugin`, `AiAssistantPluginOptions`
- `ProductEmbedding`, `VariantEmbedding`, `CollectionEmbedding`
- `EmbeddingService`, `ProductEmbeddingService`, `VariantEmbeddingService`, `CollectionEmbeddingService`
- `SimilarProductResult`, `SimilarVariantResult`, `SimilarCollectionResult`
- `AI_ASSISTANT_OPTIONS`, `EMBED_ALL_QUEUE_NAME`
