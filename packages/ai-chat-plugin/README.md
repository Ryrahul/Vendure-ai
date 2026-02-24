# @rahul_vendure/ai-chat-plugin

AI-powered shopping assistant plugin for [Vendure](https://www.vendure.io/) e-commerce. Adds an LLM-driven chat endpoint to your Vendure server with product search, vector search, cart management, order tracking, and checkout assistance.

## Features

- **LLM Chat** — GPT-4o-mini powered shopping assistant via Vercel AI SDK
- **14 Built-in Tools** — search, vector search, collections, price filter, add-to-cart, cart view/adjust, order history/tracking, checkout (addresses, shipping)
- **Streaming** — Real-time streaming responses via `POST /ai-assistant/stream` (compatible with `useChat()` from `@ai-sdk/react`)
- **Non-streaming** — JSON response via `POST /ai-assistant/chat`
- **Vector Search** — pgvector-powered semantic search over products and collections
- **Auto-Embedding** — Automatic embedding generation on product/variant/collection create/update/delete
- **Bulk Embedding** — Admin GraphQL mutation `triggerEmbedAll` to embed all existing catalog data
- **Self-Managing Schema** — Automatically creates pgvector extension and embedding columns

## Requirements

- Vendure `>=3.0.0`
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- OpenAI API key

## Installation

```bash
npm install @rahul_vendure/ai-chat-plugin
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

Use the companion package [`@rahul_vendure/ai-chat-react`](../ai-chat-react) for a drop-in React chat UI:

```bash
npm install @rahul_vendure/ai-chat-react ai @ai-sdk/react
```

```tsx
<VendureAiChat vendureUrl="https://my-vendure.com" />
```

See the [`@rahul_vendure/ai-chat-react` README](../ai-chat-react) for full docs.

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `openaiApiKey` | `string` | Yes | — | Your OpenAI API key |
| `embeddingModel` | `string` | No | `'text-embedding-3-small'` | OpenAI embedding model to use |
| `assetBaseUrl` | `string` | No | Auto-detected | Base URL for product images (e.g. `https://my-vendure.com/assets/`) |

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

The AI assistant has 14 built-in tools:

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
| `setShippingAddress` | Set shipping address on active order |
| `setBillingAddress` | Set billing address on active order |
| `setShippingMethod` | Set shipping method on active order |

## Entities

The plugin adds three entities to your database:

- `product_embedding` — Vector embeddings for products
- `variant_embedding` — Vector embeddings for product variants
- `collection_embedding` — Vector embeddings for collections

These are automatically managed. The plugin creates the pgvector extension and embedding columns on startup.

## Exported Services

For advanced use cases, you can inject these services in your own plugins:

```ts
import {
    AiChatService,
    EmbeddingService,
    ProductEmbeddingService,
    VariantEmbeddingService,
    CollectionEmbeddingService,
} from '@rahul_vendure/ai-chat-plugin';
```

## License

MIT
