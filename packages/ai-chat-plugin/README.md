# @rahul_vendure/ai-chat-plugin

AI-powered shopping assistant plugin for [Vendure](https://www.vendure.io/) e-commerce. Adds an LLM-driven chat endpoint to your Vendure server with product search, vector search, cart management, order tracking, and checkout assistance.

## Features

- **LLM Chat** — shopping assistant via Vercel AI SDK (`gpt-4o-mini` by default, configurable)
- **Uses your search engine** — product search goes through your store's Shop API `search` query, so it works with DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch or any search plugin, and respects channel, language, currency and visibility
- **14 Built-in Tools** — search, vector search, collections, price filter, add-to-cart, cart view/adjust, order history/tracking, checkout (addresses, shipping)
- **Streaming** — Real-time streaming responses via `POST /ai-assistant/stream` (compatible with `useChat()` from `@ai-sdk/react`)
- **Non-streaming** — JSON response via `POST /ai-assistant/chat`
- **Vector Search** — pgvector-powered semantic search over products and collections
- **Auto-Embedding** — Automatic embedding generation on product/variant/collection create/update/delete
- **Bulk Embedding** — Admin GraphQL mutation `triggerEmbedAll` to embed all existing catalog data
- **Embedding Entities** — Registers TypeORM entities for vector storage (requires pgvector and a migration)

## Requirements

- Vendure `>=3.1.0 <4` (tested on 3.5.4 and 3.8.0)
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- OpenAI API key

## Installation

```bash
npm install @rahul_vendure/ai-chat-plugin
```

## Prerequisites

1. **Install pgvector** — The [pgvector](https://github.com/pgvector/pgvector) extension must be installed in your PostgreSQL instance. Enable it by running:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. **Run migrations** — The plugin registers the entities with Vendure, but you must generate and run a database migration to create the tables and vector columns:
   ```bash
   npx vendure migrate
   ```

## Setup

### 1. Add the plugin to your Vendure config

```ts
// vendure-config.ts
import { AiAssistantPlugin } from '@rahul_vendure/ai-chat-plugin';

export const config: VendureConfig = {
    // CORS — allow your storefront origin so the browser can call /ai-assistant/stream directly
    apiOptions: {
        cors: {
            origin: ['http://localhost:3001', 'https://my-storefront.com'],
        },
    },
    plugins: [
        // ... other plugins
        AiAssistantPlugin.init({
            openaiApiKey: process.env.OPENAI_API_KEY!,
            embeddingModel: 'text-embedding-3-small', // optional, this is the default
            assetBaseUrl: 'https://my-vendure.com/assets/', // optional, auto-detected in dev
        }),
    ],
};
```

### 2. Embed your catalog

After starting the server, run the `triggerEmbedAll` mutation from the Admin API (GraphiQL at `/admin-api`):

```graphql
mutation {
    triggerEmbedAll {
        jobId
        message
    }
}
```

This generates vector embeddings for all products, variants, and collections in the background. You only need to run this once — after that, embeddings are automatically kept in sync on create/update/delete.

### 3. Add the frontend

Use the companion package [`@rahul_vendure/ai-chat-react`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-react) for a drop-in React chat UI:

```bash
npm install @rahul_vendure/ai-chat-react ai @ai-sdk/react
```

```tsx
<VendureAiChat vendureUrl="https://my-vendure.com" />
```

See the [`@rahul_vendure/ai-chat-react` README](https://www.npmjs.com/package/@rahul_vendure/ai-chat-react) for full docs.

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `openaiApiKey` | `string` | Yes | — | Your OpenAI API key |
| `embeddingModel` | `string` | No | `'text-embedding-3-small'` | OpenAI embedding model to use |
| `assetBaseUrl` | `string` | No | Auto-detected | Base URL for product images (e.g. `https://my-vendure.com/assets/`) |
| `chatModel` | `string` | No | `'gpt-4o-mini'` | Chat model for shop and admin conversations |
| `shopApiUrl` | `string` | No | `http://127.0.0.1:<port>/<shopApiPath>` | This server's Shop API, used for engine-agnostic search. Set it if the server can't reach itself on that address |
| `exposeCouponCodes` | `boolean` | No | `false` | Whether the shop assistant may reveal promotion coupon codes |
| `maxMessageLength` | `number` | No | `2000` | Max characters per shopper message (longer → HTTP 400) |
| `maxHistoryMessages` | `number` | No | `20` | Max previous messages sent to the model per turn |
| `enableConversationCache` | `boolean` | No | `true` | Cache shop conversations server-side (scoped to the customer or session) |
| `azureOpenai` | `object` | No | — | Azure OpenAI fallback for chat |

## Search

Vendure has no engine-agnostic search service — each search plugin replaces the Shop API `search` resolver. The assistant therefore runs `search`, `products` and `collections` through your own Shop API (anonymously, in the shopper's channel, language and currency):

- **Any engine works**: DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch, or a custom one.
- **Optional engine features are detected at runtime**: if your engine supports `priceRangeWithTax` (e.g. Elasticsearch), price filters run in the engine; otherwise a bounded in-memory filter is used. Stock status is shown when the engine exposes `inStock`.
- **Semantic (pgvector) results are hydrated through the Shop API too**, so a product that is disabled, deleted, not in the shopper's channel, or hidden by another plugin is never suggested.
- Prices are what the customer pays (tax included), formatted in the channel currency.

## API Endpoints

### `POST /ai-assistant/stream`

Streaming endpoint compatible with the Vercel AI SDK `useChat()` hook. Returns a [UI Message Stream](https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol#ui-message-stream-protocol) response.

The `@rahul_vendure/ai-chat-react` package connects to this endpoint automatically — you don't need to call it manually.

**Request:**
```json
{
    "message": "Show me laptops under $1000",
    "history": [
        { "role": "user", "content": "Hi" },
        { "role": "assistant", "content": "Hello! How can I help?" }
    ]
}
```

**Auth:** Pass a Bearer token in the `Authorization` header for logged-in user features (cart, orders).

### `POST /ai-assistant/chat`

Non-streaming endpoint. Returns the full response as JSON after all tool calls complete.

**Response:**
```json
{
    "message": "Here are some laptops I found!",
    "products": [
        { "id": "1", "name": "Gaming Laptop", "slug": "gaming-laptop", "price": 89900, "image": "https://...", "variantId": "42" }
    ],
    "collections": [],
    "addToCartAction": null,
    "activeOrder": null
}
```

## CORS

The React frontend connects **directly** to the Vendure server from the browser (no proxy needed). You must configure CORS to allow your storefront origin:

```ts
export const config: VendureConfig = {
    apiOptions: {
        cors: {
            origin: ['https://my-storefront.com'],
        },
    },
};
```

> In development, Vendure allows all origins by default, so no CORS config is needed for `localhost`.

## Tools

The AI assistant has 19 built-in tools:

| Tool | Description |
|------|-------------|
| `searchProducts` | Keyword search using Vendure's fulltext search index |
| `vectorSearch` | Semantic/intent-based search using pgvector embeddings |
| `getCollections` | List product collections/categories |
| `filterByPrice` | Filter products by price range |
| `addToCart` | Add a product variant to the customer's cart |
| `getActiveOrder` | Get the current cart with all line items |
| `adjustOrderLine` | Change quantity or remove items from cart |
| `getOrderHistory` | List past orders for the customer |
| `trackOrder` | Get order status and tracking information |
| `getAvailableCountries` | List countries for shipping/billing |
| `getEligibleShippingMethods` | Get shipping options for active order |
| `getEligiblePaymentMethods` | Get available payment methods for active order |
| `setShippingAddress` | Set shipping address on active order |
| `setBillingAddress` | Set billing address on active order |
| `setShippingMethod` | Set shipping method on active order |
| `getAvailablePromotions` | List active promotions and deals (automatic + coupon-based) |
| `applyCouponCode` | Apply a coupon/promo code to the active order |
| `removeCouponCode` | Remove a coupon code from the active order |
| `getCartDiscounts` | View cart discounts and how close the customer is to qualifying for promotions |

## Entities

The plugin adds three entities to your database:

- `product_embedding` — Vector embeddings for products
- `variant_embedding` — Vector embeddings for product variants
- `collection_embedding` — Vector embeddings for collections

## Admin Dashboard AI Chat

The plugin also includes a built-in admin chat endpoint at `POST /admin-ai-chat/chat`.

**Security**

- Every `/admin-ai-chat/*` route requires the custom **`UseAiAdminAssistant`** permission (SuperAdmins have it; grant it to other roles explicitly). Authentication is Vendure's own (Bearer token or session cookie, `vendure-token` for the channel).
- Each admin tool requires the same permission as the equivalent Admin API operation in the active channel (e.g. `createAdministrator` needs `CreateAdministrator`). Tools the administrator may not use are not offered to the model at all.
- Chat sessions are private: administrators can only list, read, continue or delete their own.
- `triggerEmbedAll` requires `UpdateCatalog` or `UpdateProduct`.

Some of the admin tools:

| Tool | Description |
|------|-------------|
| `searchProducts` | Keyword search with admin details (stock levels, enabled status, variant count) |
| `vectorSearch` | Semantic search for products by intent |
| `getProductDetails` | Full product details with all variants, SKUs, stock |
| `searchOrders` | Search orders by code, customer, or state |
| `searchCustomers` | Search customers by name/email with order stats |
| `getCollections` | List/search collections with product counts |

To add the admin chat UI to your Vendure dashboard, install the companion package:

```bash
npm install @rahul_vendure/ai-chat-dashboard
```

See the [`@rahul_vendure/ai-chat-dashboard` README](https://www.npmjs.com/package/@rahul_vendure/ai-chat-dashboard) for setup instructions.

## Exported Services

For advanced use cases, you can inject these services in your own plugins:

```ts
import {
    AiChatService,          // Storefront chat service
    AdminAiChatService,     // Admin dashboard chat service
    EmbeddingService,
    ProductEmbeddingService,
    VariantEmbeddingService,
    CollectionEmbeddingService,
} from '@rahul_vendure/ai-chat-plugin';
```

## License

AGPL-3.0 — see [LICENSE](./LICENSE) for details.
