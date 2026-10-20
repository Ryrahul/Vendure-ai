# @rahul_vendure/ai-chat-plugin

AI-powered shopping assistant plugin for [Vendure](https://www.vendure.io/) e-commerce. Adds an LLM-driven chat endpoint to your Vendure server with product search, vector search, cart management, order tracking, and checkout assistance.

## Features

- **LLM Chat** — shopping assistant via Vercel AI SDK: OpenAI (`gpt-4o-mini` by default), Azure OpenAI, or any AI SDK model — Anthropic, Google, or self-hosted OpenAI-compatible servers (Ollama, vLLM, LM Studio, DeepSeek, OpenRouter). See [Model providers](#model-providers)
- **Uses your search engine** — product search goes through your store's Shop API `search` query, so it works with DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch or any search plugin, and respects channel, language, currency and visibility
- **19 Shop Tools** — search, semantic search, collections, price filter, add-to-cart, cart view/adjust (guests too), order history/tracking, checkout (addresses, shipping, payment methods), promotions and coupons
- **Admin assistant** — ~100 admin tools, each gated by the matching Vendure permission, with human confirmation for destructive actions
- **Business insights in the admin chat** — sales summaries and trends, a 30-day sales forecast with a likely range and measured accuracy, an inventory reorder plan, customer locations, and competitor/pricing research on the web, shown as charts and tables in the chat. See [Business insights](#business-insights)
- **Guard-rails** — write tools run in transactions, per-shopper/IP/admin rate limits and daily token budgets
- **Streaming** — Real-time streaming responses via `POST /ai-assistant/stream` (compatible with `useChat()` from `@ai-sdk/react`)
- **Non-streaming** — JSON response via `POST /ai-assistant/chat`
- **Vector Search** — pgvector-powered semantic search over products and collections
- **Auto-Embedding** — Products and collections are re-embedded on change, batched, and only when their text actually changed
- **Bulk Embedding** — Admin GraphQL mutation `triggerEmbedAll` to embed all existing catalog data
- **Embedding Entities** — Registers TypeORM entities for vector storage (requires pgvector and a migration)

## Requirements

- Vendure `>=3.1.0 <4` (tested on 3.5.4 and 3.8.0)
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- An OpenAI API key — or another chat model plus your own embeddings (see [Model providers](#model-providers))

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

This embeds all products and collections in the background. Afterwards, embeddings stay in sync automatically:

- **Batched:** changes are collected for ~1.5 s and embedded together (one OpenAI request per 100 texts).
- **Only what changed:** each row stores a hash of the embedded text, so unchanged products and collections are never re-embedded — a price or stock change costs nothing, and re-running `triggerEmbedAll` only embeds what changed.
- **Clean text:** names plus descriptions with HTML stripped.

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
| `openaiApiKey` | `string` | Yes, unless other providers cover chat and embeddings | — | Your OpenAI API key (chat, embeddings and web search) |
| `chatModel` | `string \| LanguageModel` | No | `'gpt-4o-mini'` | OpenAI model name, or any AI SDK model instance — see [Model providers](#model-providers) |
| `azureOpenai` | `object` | No | — | Azure OpenAI chat deployment: the chat model when there is no `openaiApiKey`, otherwise the fallback |
| `embeddingModel` | `string \| EmbeddingModel` | No | `'text-embedding-3-small'` | OpenAI embedding model name, or any AI SDK embedding model instance |
| `embedTexts` | `(texts) => Promise<number[][]>` | No | — | Your own embedding function, instead of `embeddingModel` |
| `embeddingDimensions` | `number` | No | `1536` | Vector size; must match the embedding model |
| `enableWebResearch` | `boolean` | No | `true` | Let the admin assistant search the web and read public pages |
| `webSearch` | `(query, location) => Promise<{ summary, sources }>` | No | OpenAI web search | Your own web search (Tavily, Brave, SerpAPI, …) |
| `assetBaseUrl` | `string` | No | Auto-detected | Base URL for product images (e.g. `https://my-vendure.com/assets/`) |
| `shopApiUrl` | `string` | No | `http://127.0.0.1:<port>/<shopApiPath>` | This server's Shop API, used for engine-agnostic search. Set it if the server can't reach itself on that address |
| `exposeCouponCodes` | `boolean` | No | `false` | Whether the shop assistant may reveal promotion coupon codes |
| `maxMessageLength` | `number` | No | `2000` | Max characters per shopper message (longer → HTTP 400) |
| `maxHistoryMessages` | `number` | No | `20` | Max previous messages sent to the model per turn |
| `enableConversationCache` | `boolean` | No | `true` | Cache shop conversations server-side (scoped to the customer or session) |
| `limits` | `object` | No | see [Usage limits](#usage-limits) | Message rate limits and daily token budgets |
| `adminToolsRequiringConfirmation` | `string[]` | No | deletes + staff/roles/channels/settings/payment changes | Admin tools that only run after the administrator presses Confirm |

## Model providers

Out of the box everything runs on OpenAI with `openaiApiKey`. Each part can be swapped:

| | Default | Alternatives |
|---|---|---|
| Chat | `openaiApiKey` + `chatModel` name | `azureOpenai`, or `chatModel` as any AI SDK model instance (must support tool calling) |
| Embeddings | `openaiApiKey` + `embeddingModel` name | `embeddingModel` as any AI SDK embedding model, or your own `embedTexts` function — set `embeddingDimensions` to match |
| Web search (admin) | OpenAI built-in web search, or Azure's (`webSearchPreview`) without an OpenAI key | your own `webSearch` function; none for other providers unless you register one |

```ts
import { createAzure } from '@ai-sdk/azure';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// Self-hosted (Ollama, vLLM, LM Studio …) or any OpenAI-compatible API (DeepSeek, OpenRouter …)
const local = createOpenAICompatible({ name: 'ollama', baseURL: 'http://localhost:11434/v1' });

AiAssistantPlugin.init({
    chatModel: local('qwen3:14b'),
    embeddingModel: local.textEmbeddingModel('nomic-embed-text'),
    embeddingDimensions: 768,
    // or your own: embedTexts: async texts => myEmbeddingService.embed(texts),
});

// Azure only: chat on Azure, embeddings on an Azure embedding deployment
const azure = createAzure({ apiKey: process.env.AZURE_KEY, resourceName: 'my-resource' });
AiAssistantPlugin.init({
    azureOpenai: { apiKey: process.env.AZURE_KEY!, resourceName: 'my-resource', deploymentName: 'gpt-4.1' },
    embeddingModel: azure.textEmbeddingModel('text-embedding-3-small'),
});
```

Install the provider package you use (`@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, …) in your project. The server and worker check at startup that a chat model and an embedding source are configured (build tools that only load the config, like the dashboard's `vite build`, don't need the keys).

**Changing the embedding model:** set `embeddingDimensions` to the new model's size. The `embedding` columns change size (with `synchronize: true`, or generate a migration), which clears the stored vectors; then run `triggerEmbedAll` ("Embed all" in the dashboard). Similarity thresholds are tuned for OpenAI's `text-embedding-3` models; other models may return more or fewer semantic matches.

**Web search** for the admin assistant uses OpenAI's built-in search when `openaiApiKey` is set, otherwise the Azure deployment's built-in search (`azureOpenai`) — both billed by the provider per search. Self-hosted and other providers have no default; register your own:

```ts
AiAssistantPlugin.init({
    // ...
    webSearch: async (query, location) => {
        // Call your search API (Tavily, Brave, SerpAPI, Bing, …); `location` comes from the store profile.
        const results = await mySearchApi.search(`${query} ${location.city ?? ''} ${location.countryCode ?? ''}`.trim());
        return {
            summary: results.map(r => `${r.title} (${r.url}): ${r.snippet}`).join('\n'),
            sources: results.map(r => ({ title: r.title, url: r.url })),
        };
    },
});
```

Without any web search the assistant says research is unavailable rather than guessing.

## Search

Vendure has no engine-agnostic search service — each search plugin replaces the Shop API `search` resolver. The assistant therefore runs `search`, `products` and `collections` through your own Shop API (anonymously, in the shopper's channel, language and currency):

- **Any engine works**: DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch, or a custom one.
- **Optional engine features are detected at runtime**: if your engine supports `priceRangeWithTax` (e.g. Elasticsearch), price filters run in the engine; otherwise a bounded in-memory filter is used. Stock status is shown when the engine exposes `inStock`.
- **Semantic (pgvector) results are hydrated through the Shop API too**, so a product that is disabled, deleted, not in the shopper's channel, or hidden by another plugin is never suggested.
- Prices are what the customer pays (tax included), formatted in the channel currency.

## Guest carts

Cart, checkout and coupon tools work for guests as well as logged-in customers: the assistant uses the shopper's active order exactly like the Shop API's `activeOrder` query (via `ActiveOrderService`, honouring any custom `ActiveOrderStrategy`). A guest's cart belongs to their Shop API session, so the chat request must carry the **same session** as the storefront — pass the storefront's auth token (`authToken` on `<VendureAiChat>`), or use cookie sessions on the same domain. Order history and order tracking still require a logged-in customer.

## Usage limits

Every chat message is checked before the model is called; exceeding a limit returns HTTP 429.

| Limit (`limits.*`) | Default | Counted per |
|---|---|---|
| `shopMessagesPerMinute` | 20 | customer, else session, else IP |
| `shopMessagesPerMinutePerIp` | 60 | IP address (stops session hopping) |
| `shopTokensPerDay` | 200 000 | customer, else session, else IP |
| `adminMessagesPerMinute` | 30 | administrator |
| `adminTokensPerDay` | 1 000 000 | administrator |

Set any value to `0` to disable it. Counters live in Vendure's `CacheService` (use a shared cache strategy, e.g. Redis, to share them between server instances). Behind a proxy, set `apiOptions.trustProxy` so the client IP is correct.

## Write safety

Every tool that changes data (cart and checkout changes, admin writes) runs in a database transaction. If it fails partway — or reports a failure — everything it changed is rolled back, so e.g. a failed "create product with variants" never leaves a half-created product.

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

The shop assistant has 19 built-in tools:

| Tool | Description |
|------|-------------|
| `searchProducts` | Keyword search through your store's configured search engine (Shop API `search`) |
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

The plugin adds these entities to your database:

- `product_embedding` — Vector embeddings for products (`contentHash` column since 0.4.0)
- `collection_embedding` — Vector embeddings for collections (`contentHash` column since 0.4.0)
- `variant_embedding` — no longer written since 0.4.0 (it was never used for search); kept so existing databases don't need a destructive migration
- `ai_chat_session` — admin chat history
- `ai_store_profile` — per-channel store profile for the business-insight tools (since 0.5.0)

## Admin Dashboard AI Chat

The plugin also includes a built-in admin chat endpoint at `POST /admin-ai-chat/chat`.

**Security**

- Every `/admin-ai-chat/*` route requires the custom **`UseAiAdminAssistant`** permission (SuperAdmins have it; grant it to other roles explicitly). Authentication is Vendure's own (Bearer token or session cookie, `vendure-token` for the channel).
- Each admin tool requires the same permission as the equivalent Admin API operation in the active channel (e.g. `createAdministrator` needs `CreateAdministrator`). Tools the administrator may not use are not offered to the model at all.
- Chat sessions are private: administrators can only list, read, continue or delete their own.
- `triggerEmbedAll` requires `UpdateCatalog` or `UpdateProduct`.
- **Destructive actions need a human click.** Deletes and changes to administrators, roles, channels, global settings and payment methods are only *requested* by the model; the dashboard shows Confirm / Cancel and the action runs via `POST /admin-ai-chat/confirm` (which the model cannot call). Pending actions belong to the requesting administrator, are single-use, expire after 10 minutes, and run in a transaction. Set `adminToolsRequiringConfirmation` to change the list (`[]` disables).

Some of the admin tools:

| Tool | Description |
|------|-------------|
| `searchProducts` | Keyword search with admin details (stock levels, enabled status, variant count) |
| `vectorSearch` | Semantic search for products by intent |
| `getProductDetails` | Full product details with all variants, SKUs, stock |
| `searchOrders` | Search orders by code, customer, or state |
| `searchCustomers` | Search customers by name/email with order stats |
| `getCollections` | List/search collections with product counts |

### Business insights

The admin assistant doubles as a business analyst. Ask things like *"How did sales go this month and what will the next 30 days look like?"*, *"What should I reorder?"* or *"Research competitor prices for my top products"*. The figures come from tools, never from the model, and the dashboard renders them as charts and tables under the reply.

| Tool | What it does | Permission |
|------|--------------|------------|
| `getSalesSummary` | Revenue, orders, average order value, units and customers vs the previous period | `ReadOrder` |
| `getSalesTrend` | Revenue and orders per day, week or month | `ReadOrder` |
| `getTopSellingProducts` | Best sellers by revenue or units, with average selling price | `ReadOrder` |
| `getCustomerLocations` | Orders and revenue by country, region and city (shipping addresses) | `ReadOrder` or `ReadCustomer` |
| `forecastSales` | Daily revenue forecast (Holt-Winters with weekly seasonality, damped trend), an ~80% range for the period total, and its accuracy measured on the store's own recent history | `ReadOrder` |
| `getInventoryPlan` | Per variant: stock, sales rate, days of stock left, stock-out date, reorder status and quantity (lead time + planning period + 95% safety stock) | `ReadOrder` |
| `getStoreProfile` / `updateStoreProfile` | Store location, regions served, business description, known competitors and supplier lead time — the assistant asks for what it can't look up and saves it | `ReadSettings`/`ReadOrder` · `UpdateSettings` |
| `searchWeb` | Web search localized to the store, with source links (see [Model providers](#model-providers)) | — |
| `fetchWebPage` | Reads a public web page as text. Only http(s) on ports 80/443; private, loopback and cloud-metadata addresses are refused, also after redirects and DNS lookups | — |

The assistant doesn't interview you: it uses the saved store profile, or infers the location from where orders ship (or the channel's tax/shipping zone), uses catalog products when there are no sales yet, and states its assumptions in one line. Tell it facts ("we're in Pokhara", "our supplier takes 10 days") and it remembers them per channel.

Sales figures count placed orders in the active channel (not cancelled; seller sub-orders excluded), in the channel's currency. Forecasts are statistical projections of past sales: they don't know about upcoming promotions, holidays or stock-outs, and the assistant says so. Forecasts need at least a few weeks of orders.

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
    SalesAnalyticsService,  // Sales queries used by the insight tools
    BusinessInsightsService,// Forecasts, inventory plans, summaries
    StoreProfileService,
    forecastSeries,         // The forecasting function, for your own series
} from '@rahul_vendure/ai-chat-plugin';
```

## License

AGPL-3.0 — see [LICENSE](./LICENSE) for details.
