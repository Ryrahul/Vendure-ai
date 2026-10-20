# @rahul_vendure/ai-chat-plugin

AI assistant plugin for [Vendure](https://www.vendure.io/) 3.x. It adds two assistants to your server:

- **A shopping assistant for your storefront** — product search through your configured search engine, semantic (pgvector) search, cart and checkout for guests and customers, promotions, order tracking.
- **An admin assistant for the dashboard** — manages products, orders, customers, promotions, settings and more, each action gated by the administrator's permissions, with a Confirm button for destructive changes. It is also a **business analyst**: sales summaries, a 30-day forecast, an inventory reorder plan, customer locations and competitor research on the web, shown as charts and tables in the chat.

It runs on OpenAI out of the box, on Azure OpenAI, or on any [AI SDK](https://ai-sdk.dev) model — Anthropic, Google, Mistral, or self-hosted OpenAI-compatible servers (Ollama, vLLM, LM Studio, DeepSeek, OpenRouter) — with pluggable embeddings and web search.

| Package | What it is |
|---|---|
| `@rahul_vendure/ai-chat-plugin` | This package — the server side (Vendure plugin) |
| [`@rahul_vendure/ai-chat-dashboard`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-dashboard) | Admin chat UI for the React Vendure dashboard (charts, confirmations) |
| [`@rahul_vendure/ai-chat-react`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-react) | Drop-in storefront chat widget (React) |

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration options](#configuration-options)
- [Model providers](#model-providers) — OpenAI, Azure, any AI SDK model, custom embeddings and web search
- [Embeddings](#embeddings)
- [Search](#search)
- [Shop assistant](#shop-assistant) — tools, guest carts, endpoints, CORS
- [Admin assistant](#admin-assistant) — security, confirmations, tools, endpoints
- [Business insights](#business-insights) — sales, forecast, inventory, web research
- [Usage limits](#usage-limits) · [Write safety](#write-safety)
- [Database](#database) · [Upgrading](#upgrading) · [Troubleshooting](#troubleshooting)
- [Exports](#exports) · [Compatibility](#compatibility)

## Requirements

- Vendure `>=3.1.0 <4` (tested on 3.5.4 and 3.8.0)
- PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension
- A chat model and an embedding source: an OpenAI API key covers both; alternatives under [Model providers](#model-providers)

## Quick start

### 1. Install

```bash
npm install @rahul_vendure/ai-chat-plugin
```

Enable pgvector in your database once:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Add the plugin

```ts
// vendure-config.ts
import { AiAssistantPlugin } from '@rahul_vendure/ai-chat-plugin';

export const config: VendureConfig = {
    apiOptions: {
        // Allow your storefront origin so the browser can call /ai-assistant/stream directly
        cors: { origin: ['http://localhost:3001', 'https://my-storefront.com'], credentials: true },
    },
    plugins: [
        // ...
        AiAssistantPlugin.init({
            openaiApiKey: process.env.OPENAI_API_KEY!,
            assetBaseUrl: 'https://my-vendure.com/assets/', // optional, auto-detected in development
        }),
    ],
};
```

### 3. Create the tables

The plugin registers its entities with Vendure. With `synchronize: true` they are created on start; otherwise generate and run a migration:

```bash
npx vendure migrate
```

### 4. Embed your catalog

Start the server and worker, then run this once from the Admin API (e.g. GraphiQL at `/admin-api`) — or press **Embed all** on **Settings → Global settings** in the dashboard (with `@rahul_vendure/ai-chat-dashboard`):

```graphql
mutation {
    triggerEmbedAll { jobId message }
}
```

After that, embeddings stay in sync on their own (see [Embeddings](#embeddings)).

### 5. Add the UIs

- **Dashboard** — `npm install @rahul_vendure/ai-chat-dashboard` and add `AiChatDashboardPlugin` to your plugins ([setup](https://www.npmjs.com/package/@rahul_vendure/ai-chat-dashboard)).
- **Storefront** — `npm install @rahul_vendure/ai-chat-react ai@^6 @ai-sdk/react@^3` and render `<VendureAiChat vendureUrl="https://my-vendure.com" />` ([setup](https://www.npmjs.com/package/@rahul_vendure/ai-chat-react)).

Administrators need the **`UseAiAdminAssistant`** permission (SuperAdmins have it).

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `openaiApiKey` | `string` | — | OpenAI API key, used for chat, embeddings and web search unless other providers are configured. Required unless `chatModel`/`azureOpenai` **and** `embeddingModel`/`embedTexts` cover everything |
| `chatModel` | `string \| LanguageModel` | `'gpt-4o-mini'` | OpenAI model name, or any AI SDK model instance (see [Model providers](#model-providers)). Must support tool calling |
| `azureOpenai` | `{ apiKey, resourceName? \| baseURL?, deploymentName, apiVersion?, embeddingDeploymentName?, embedding? }` | — | Azure OpenAI. The chat deployment is the chat model without `openaiApiKey`, otherwise the fallback. `embeddingDeploymentName` runs embeddings on Azure too; `embedding: { apiKey?, resourceName? \| baseURL?, apiVersion? }` when that deployment is on another resource |
| `openaiCompatible` | `{ baseURL, apiKey?, chatModel?, embeddingModel?, embeddingDimensions?, name?, headers? }` | — | A self-hosted or hosted OpenAI-compatible API (Ollama, vLLM, LM Studio, llama.cpp, DeepSeek, OpenRouter, Groq…) from plain settings |
| `embeddingModel` | `string \| EmbeddingModel` | `'text-embedding-3-small'` | OpenAI embedding model name, or any AI SDK embedding model instance |
| `embedTexts` | `(texts: string[]) => Promise<number[][]>` | — | Your own embedding function, used instead of `embeddingModel` |
| `embeddingDimensions` | `number` | `1536` | Size of the vectors; must match the embedding model |
| `enableWebResearch` | `boolean` | `true` | Let the admin assistant search the web and read public pages |
| `webSearch` | `(query, location) => Promise<{ summary, sources }>` | OpenAI's, else Azure's built-in search | Your own web search (Tavily, Brave, SerpAPI, Bing…) |
| `assetBaseUrl` | `string` | auto-detected | Public base URL for product images, e.g. `https://my-vendure.com/assets/` |
| `shopApiUrl` | `string` | `http://127.0.0.1:<port>/<shopApiPath>` | This server's Shop API, used for engine-agnostic search. Set it if the server can't reach itself on that address |
| `exposeCouponCodes` | `boolean` | `false` | Whether the shop assistant may reveal promotion coupon codes |
| `maxMessageLength` | `number` | `2000` | Max characters per shopper message (longer → HTTP 400) |
| `maxHistoryMessages` | `number` | `20` | Max previous messages sent to the model per turn |
| `enableConversationCache` | `boolean` | `true` | Keep shop conversations server-side (scoped to the customer or session) |
| `limits` | `ChatLimitsOptions` | see [Usage limits](#usage-limits) | Message rate limits and daily token budgets |
| `adminToolsRequiringConfirmation` | `string[]` | deletes + staff/roles/channels/settings/payment changes | Admin tools that only run after the administrator presses Confirm; `[]` disables |

The server and worker check the model configuration when they start and stop with a clear message if no chat model or embedding source is configured. Tools that only load the config (such as the dashboard's `vite build`) don't need the keys.

## Model providers

Everything below is plain settings — the provider SDKs for OpenAI, Azure and OpenAI-compatible APIs ship with the plugin, so there is nothing else to install or import.

| | Default | Alternatives |
|---|---|---|
| **Chat** | `openaiApiKey` + `chatModel` name | `azureOpenai`; `openaiCompatible.chatModel`; or `chatModel` as any AI SDK model instance |
| **Embeddings** | `openaiApiKey` + `embeddingModel` name | `azureOpenai.embeddingDeploymentName`; `openaiCompatible.embeddingModel`; an AI SDK embedding model instance; or your own `embedTexts` — set the size with `embeddingDimensions` |
| **Web search** (admin) | OpenAI's built-in search with `openaiApiKey`; otherwise Azure's (`webSearchPreview`) with `azureOpenai` | your own `webSearch`; none for other providers unless you register one |

When several are configured, chat uses: a `chatModel` instance → `openaiCompatible.chatModel` → `openaiApiKey` → `azureOpenai` (Azure is also the fallback next to another chat model). Embeddings use: `embedTexts` → an `embeddingModel` instance → `openaiCompatible.embeddingModel` → `azureOpenai.embeddingDeploymentName` → `openaiApiKey`.

### OpenAI

```ts
AiAssistantPlugin.init({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    chatModel: 'gpt-4.1-mini',                  // optional, default 'gpt-4o-mini'
    embeddingModel: 'text-embedding-3-small',   // optional (default); 'text-embedding-3-large' needs embeddingDimensions: 3072
});
```

### Azure OpenAI only

```ts
AiAssistantPlugin.init({
    azureOpenai: {
        apiKey: process.env.AZURE_OPENAI_API_KEY!,
        resourceName: 'my-resource',            // or baseURL: 'https://my-resource.services.ai.azure.com/openai'
        deploymentName: 'gpt-4.1',              // chat deployment
        embeddingDeploymentName: 'text-embedding-3-small',
        // Only if the embedding deployment is on another resource / key:
        embedding: { apiKey: process.env.AZURE_EMBEDDING_KEY!, resourceName: 'my-embedding-resource' },
    },
});
```

Web search uses the Azure deployment's built-in search. If your deployment doesn't support it, searches report an error and the assistant says research is unavailable (or register your own `webSearch`).

### Self-hosted or OpenAI-compatible (Ollama, vLLM, LM Studio, DeepSeek, OpenRouter…)

```ts
AiAssistantPlugin.init({
    openaiCompatible: {
        baseURL: 'http://localhost:11434/v1',   // Ollama; vLLM: http://host:8000/v1; DeepSeek: https://api.deepseek.com/v1
        apiKey: process.env.LLM_API_KEY,        // hosted services only
        chatModel: 'qwen3:14b',                 // must support tool calling
        embeddingModel: 'nomic-embed-text',
        embeddingDimensions: 768,
        name: 'ollama',                         // optional, shown in chat history
    },
    webSearch: myWebSearch,                     // optional, see below
});
```

Mix and match: e.g. chat on DeepSeek (`openaiCompatible` without `embeddingModel`) with embeddings on OpenAI (`openaiApiKey`) — `openaiCompatible.chatModel` takes precedence for chat.

### Any other AI SDK provider

For Anthropic, Google, Mistral, Bedrock… install the provider package and pass the model:

```ts
import { anthropic } from '@ai-sdk/anthropic';

AiAssistantPlugin.init({
    chatModel: anthropic('claude-sonnet-5-5'),
    openaiApiKey: process.env.OPENAI_API_KEY!, // embeddings and web search on OpenAI
});
```

`embeddingModel` accepts any AI SDK embedding model instance the same way.

### Your own embedding service

```ts
AiAssistantPlugin.init({
    // ...
    embedTexts: async texts => myEmbeddingService.embed(texts), // one vector per text, in order
    embeddingDimensions: 1024,
});
```

### Your own web search

Return the findings as text plus their sources; `location` is the store's saved or inferred location:

```ts
AiAssistantPlugin.init({
    // ...
    webSearch: async (query, location) => {
        const results = await mySearchApi.search(`${query} ${location.city ?? ''} ${location.countryCode ?? ''}`.trim());
        return {
            summary: results.map(r => `${r.title} (${r.url}): ${r.snippet}`).join('\n'),
            sources: results.map(r => ({ title: r.title, url: r.url })),
        };
    },
});
```

Each search has a 45-second limit; a slow search is reported as missing and the assistant answers with the rest. Built-in searches are billed by OpenAI/Azure per call.

## Embeddings

Products and collections are embedded (name + description, HTML stripped) for semantic search.

- **Automatic and batched:** changes are collected for ~1.5 s and embedded together (100 texts per request).
- **Only what changed:** each row stores a hash of the embedded text and model, so price or stock changes cost nothing and re-running `triggerEmbedAll` only embeds what changed.
- **Changing the model:** set `embeddingDimensions` to the new model's size. The `embedding` columns change size (with `synchronize: true`, or in a generated migration), which clears the stored vectors; then run `triggerEmbedAll`. A vector of the wrong size fails with a message naming both sizes.
- Similarity thresholds are tuned for OpenAI's `text-embedding-3` models; other models may return more or fewer semantic matches.

## Search

Vendure has no engine-agnostic search service — each search plugin replaces the Shop API `search` resolver. The assistant therefore runs `search`, `products` and `collections` through your own Shop API (anonymously, in the shopper's channel, language and currency):

- **Any engine works:** DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch or a custom one.
- **Optional engine features are detected at runtime:** price filters run in the engine when it supports `priceRangeWithTax` (e.g. Elasticsearch), otherwise a bounded in-memory filter is used; stock status is shown when the engine exposes `inStock`.
- **Semantic results are hydrated through the Shop API too**, so a product that is disabled, deleted, not in the shopper's channel or hidden by another plugin is never suggested.
- Prices are what the customer pays (tax included), in the channel currency.

## Shop assistant

### Tools

| Tool | Description |
|------|-------------|
| `searchProducts` | Keyword search through your store's search engine (Shop API `search`) |
| `vectorSearch` | Semantic, intent-based search ("something for a long flight") |
| `getCollections` | Product collections/categories |
| `filterByPrice` | Products within a price range |
| `addToCart` | Add a variant to the cart |
| `getActiveOrder` | The current cart |
| `adjustOrderLine` | Change a quantity or remove a line |
| `getOrderHistory` | The customer's past orders (logged in) |
| `trackOrder` | Order status and tracking (logged in) |
| `getAvailableCountries` | Countries for addresses |
| `getEligibleShippingMethods` / `setShippingMethod` | Shipping options for the cart |
| `getEligiblePaymentMethods` | Payment methods for the cart |
| `setShippingAddress` / `setBillingAddress` | Addresses on the cart |
| `getAvailablePromotions` | Active promotions (automatic and coupon-based) |
| `applyCouponCode` / `removeCouponCode` | Coupons on the cart |
| `getCartDiscounts` | Discounts applied, and how close the cart is to qualifying for others |

### Guest carts

Cart, checkout and coupon tools work for guests and logged-in customers alike: the assistant uses the shopper's active order exactly like the Shop API's `activeOrder` query (via `ActiveOrderService`, honouring custom `ActiveOrderStrategy`s). A guest's cart belongs to their Shop API session, so chat requests must carry the **same session** as the storefront — pass the storefront's current auth token to the widget (`authToken`), or use cookie sessions on the same domain. Order history and tracking require a logged-in customer.

### Endpoints

**`POST /ai-assistant/stream`** — streaming, for `useChat()` from `@ai-sdk/react` (the React widget uses it). Returns an AI SDK [UI message stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol). Body: `{ messages: UIMessage[], conversationId?: string }`. With a `conversationId` (16–100 characters of `A–Z a–z 0–9 _ -`) the server keeps the history itself, scoped to the customer or session.

**`POST /ai-assistant/chat`** — JSON response after all tool calls. Body: `{ message: string, history?: [{ role, content }], conversationId?: string }` (or `messages` as above).

```json
{
    "message": "Here are some headphones that suit a long flight.",
    "products": [{ "id": "5", "name": "Headphones", "slug": "headphones", "price": 9900, "currencyCode": "NPR", "image": "https://…", "variantId": "6" }],
    "collections": [],
    "activeOrder": { "code": "…", "totalWithTax": 9900, "currencyCode": "NPR", "lines": [] },
    "addToCartAction": null
}
```

Headers: `vendure-token` selects the channel; `Authorization: Bearer <token>` (or the session cookie) identifies the shopper. Prices are in the smallest currency unit.

### CORS

The widget calls the Vendure server directly from the browser, so allow your storefront origin in `apiOptions.cors` (with `credentials: true` if you use cookie sessions). In development Vendure allows all origins.

## Admin assistant

### Security

- Every `/admin-ai-chat/*` route requires the custom **`UseAiAdminAssistant`** permission (SuperAdmins have it; grant it to other roles explicitly). Authentication is Vendure's own (Bearer token or session cookie; `vendure-token` selects the channel).
- Each admin tool requires the same permission as the equivalent Admin API operation **in the active channel** (e.g. `createAdministrator` needs `CreateAdministrator`). Tools the administrator may not use are not offered to the model at all.
- Product tools only see the active channel's products, with that channel's prices and currency.
- Chat sessions are private: administrators can only list, read, continue or delete their own.
- `triggerEmbedAll` requires `UpdateCatalog` or `UpdateProduct`.

### Confirmations

Deletes and changes to administrators, roles, channels, global settings and payment methods are only **requested** by the model: the dashboard shows Confirm / Cancel, and the action runs via `POST /admin-ai-chat/confirm`, which the model cannot call. Pending actions belong to the requesting administrator, are single-use, expire after 10 minutes and run in a transaction. Change the list with `adminToolsRequiringConfirmation` (`DEFAULT_ADMIN_TOOLS_REQUIRING_CONFIRMATION` is exported; `[]` disables).

### Tools

About 100 tools across products, variants, stock, assets, collections, facets, orders (incl. fulfilment, refunds and notes), customers and customer groups, promotions, shipping and payment methods, tax, countries, stock locations, administrators and roles, channels and global settings — plus `navigateToPage` to open dashboard pages, and the [business insight](#business-insights) tools. `ADMIN_TOOL_PERMISSIONS` (exported) lists the permission each tool needs.

### Endpoints

| Endpoint | Body / query | Returns |
|---|---|---|
| `POST /admin-ai-chat/chat` | `{ message, sessionId?, currentPage? }` | `{ message, sessionId, products, collections, orders?, navigateTo?, pendingConfirmations?, insights?, usage? }` |
| `POST /admin-ai-chat/confirm` | `{ confirmationId }` | `{ success, summary, products?, orders? }` |
| `POST /admin-ai-chat/cancel` | `{ confirmationId }` | `{ success }` |
| `GET /admin-ai-chat/sessions` | `?take=50&skip=0` | the administrator's sessions |
| `GET /admin-ai-chat/sessions/:sessionId` | — | one session with its messages and insight cards |
| `DELETE /admin-ai-chat/sessions/:sessionId` | — | `{ success }` |

`insights` is a list of `InsightCard`s (exported type): `salesSummary`, `salesTrend`, `forecast`, `inventoryPlan`, `topProducts`, `customerLocations`, `webSources`. Amounts are in the smallest currency unit.

## Business insights

The admin assistant doubles as a business analyst. Ask *"How did sales go this month and what will the next 30 days look like?"*, *"What should I reorder?"*, *"Where are my customers?"* or *"Research competitor prices for my top products"*. All figures come from tools — the model only explains them — and the dashboard shows them as charts and tables under the reply.

| Tool | What it does | Permission |
|------|--------------|------------|
| `getSalesSummary` | Revenue, orders, average order value, units and customers vs the previous period (default 30 days) | `ReadOrder` |
| `getSalesTrend` | Revenue and orders per day, week or month (default 90 days by week) | `ReadOrder` |
| `getTopSellingProducts` | Best sellers by revenue or units, with average selling price | `ReadOrder` |
| `getCustomerLocations` | Orders and revenue by country, region and city, from shipping addresses | `ReadOrder` or `ReadCustomer` |
| `forecastSales` | Daily revenue forecast (default next 30 days, from up to 180 days of history) with a likely range and measured accuracy | `ReadOrder` |
| `getInventoryPlan` | Per variant: stock, sales rate, days of stock left, stock-out date, reorder status and quantity | `ReadOrder` |
| `getStoreProfile` / `updateStoreProfile` | Location, delivery areas, business description, known competitors, supplier lead time (per channel) | `ReadSettings` or `ReadOrder` · `UpdateSettings` or `UpdateGlobalSettings` |
| `searchWeb` | Web search localized to the store, with source links | — |
| `fetchWebPage` | Reads a public web page as text | — |

**How the numbers are made**

- **Sales** count placed orders in the active channel (not cancelled; seller sub-orders excluded), in the channel currency. Revenue is product sales incl. tax after discounts, excl. shipping.
- **Forecast:** Holt-Winters with weekly seasonality and a damped trend (Holt or a plain mean with less history), with parameters fitted to the store's data. The range for the period total is an ~80% interval from the model's error, corrected for errors that cancel out or run in streaks. Accuracy is measured by forecasting up to three past 14-day periods and comparing with what really sold. A forecast needs at least a few weeks of orders and can't know about upcoming promotions, holidays or stock-outs — the assistant says so.
- **Inventory plan** (top 200 variants by demand over the last 120 days): daily demand = 60% of the last 28 days' average + 40% of the 28 days before; safety stock = 1.645 × daily standard deviation × √lead time (95% service level); reorder point = demand × lead time + safety stock; order quantity covers lead time + planning period + safety stock − stock. Status: *reorder now* at or below the reorder point, *reorder soon* when stock lasts less than lead time + 7 days, *overstock* beyond four planning periods, *not tracked* when stock isn't tracked. The lead time comes from the store profile (14 days until the admin gives theirs).

**It works things out instead of asking.** The location comes from the saved profile, or is inferred from where most orders ship (or from the channel's tax/shipping zone when it covers one country); with no sales yet, research uses catalog products. Assumptions are stated in one line, and facts the admin mentions ("we're in Pokhara", "our supplier takes 10 days") are saved for the channel.

**Web research.** The assistant searches per product or competitor, reads specific pages when useful, and cites a link for every competitor fact; it never states competitor prices that didn't come from a search. Web content is treated as untrusted data. `fetchWebPage` only fetches http(s) on ports 80/443, refuses private, loopback and cloud-metadata addresses (also after redirects and DNS resolution), and reads at most 1 MB within 10 seconds.

## Usage limits

Every chat message is checked before the model is called; exceeding a limit returns HTTP 429.

| Limit (`limits.*`) | Default | Counted per |
|---|---|---|
| `shopMessagesPerMinute` | 20 | customer, else session, else IP |
| `shopMessagesPerMinutePerIp` | 60 | IP address (stops session hopping) |
| `shopTokensPerDay` | 200 000 | customer, else session, else IP |
| `adminMessagesPerMinute` | 30 | administrator |
| `adminTokensPerDay` | 1 000 000 | administrator |

Set any value to `0` to disable it. Counters live in Vendure's `CacheService` (use a shared cache strategy such as Redis to share them between server instances). Behind a proxy, set `apiOptions.trustProxy` so the client IP is correct.

## Write safety

Every tool that changes data (cart and checkout changes, admin writes) runs in a database transaction. If it fails partway — or reports a failure — everything it changed is rolled back.

## Database

| Table | Purpose |
|---|---|
| `product_embedding`, `collection_embedding` | Vectors (`vector(embeddingDimensions)`) and content hashes |
| `variant_embedding` | No longer written since 0.4.0; kept so existing databases need no destructive migration |
| `ai_chat_session` | Admin chat history, including insight cards |
| `ai_store_profile` | Per-channel store profile for the business insights (since 0.5.0) |

## Upgrading

- **To 0.6.x:** no database changes. New plain-settings options `azureOpenai.embeddingDeploymentName` / `azureOpenai.embedding` and `openaiCompatible`; existing configurations work unchanged.
- **To 0.5.x:** adds the `ai_store_profile` table — run a migration if you don't use `synchronize`. `openaiApiKey` is now optional when other providers are configured, and the server stops at startup if no chat model or embedding source is configured (e.g. `openaiApiKey: process.env.OPENAI_API_KEY ?? ''` with the variable unset). Storefronts using `@rahul_vendure/ai-chat-react` should update to 0.2.4.
- **To 0.4.x:** adds a `contentHash` column to the embedding tables (migration); run `triggerEmbedAll` once afterwards.

See the [CHANGELOG](./CHANGELOG.md) for details.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Server stops with "configure a chat model" or "embeddings need …" | Set `openaiApiKey`; or `azureOpenai` (+ `embeddingDeploymentName`); or `openaiCompatible` (`chatModel` + `embeddingModel`); or `chatModel`/`embeddingModel` instances / `embedTexts` |
| "the embedding model returned N dimensions, but embeddingDimensions is M" | Set `embeddingDimensions` to the model's size, migrate, run `triggerEmbedAll` |
| Semantic search finds nothing | Run `triggerEmbedAll` and make sure the worker is running |
| Storefront chat shows no reply | Use `@rahul_vendure/ai-chat-react` ≥ 0.2.4 with `ai@^6` / `@ai-sdk/react@^3` and this plugin ≥ 0.5.0; allow your storefront origin in CORS |
| The assistant says the cart is empty after adding an item | Pass the storefront's current auth token to the widget (`authToken`), widget ≥ 0.2.4 |
| "Web research is unavailable" | No OpenAI key, no Azure deployment with web search and no `webSearch` function — or `enableWebResearch: false` |
| Research answers take a minute | Each web search takes ~10–20 s (45 s limit); the dashboard shows progress while it works |
| HTTP 403 on `/admin-ai-chat/*` | The administrator's role needs the `UseAiAdminAssistant` permission |
| HTTP 429 | A [usage limit](#usage-limits) was hit |
| Product images missing | Set `assetBaseUrl` to your AssetServerPlugin's public URL |

## Exports

```ts
import {
    AiAssistantPlugin,
    // Services you can inject
    AiChatService, AdminAiChatService, EmbeddingService, StorefrontApiService,
    ProductEmbeddingService, CollectionEmbeddingService, VariantEmbeddingService,
    SalesAnalyticsService, BusinessInsightsService, StoreProfileService,
    AdminConfirmationService, ChatLimitsService, AiChatHistoryService, ConversationCacheService,
    // Helpers
    forecastSeries, backtest,        // the forecasting functions, for your own series
    openAiWebSearch, azureWebSearch, // the built-in web search functions
    ADMIN_TOOL_PERMISSIONS, DEFAULT_ADMIN_TOOLS_REQUIRING_CONFIRMATION, aiAdminAssistantPermission,
} from '@rahul_vendure/ai-chat-plugin';
import type { AiAssistantPluginOptions, WebSearchFunction, InsightCard, AdminChatResponse } from '@rahul_vendure/ai-chat-plugin';
```

## Compatibility

Tested with Vendure 3.5.4 and 3.8.0 on PostgreSQL with pgvector, AI SDK 6, and live with OpenAI and Azure OpenAI. The test suite covers the shop and admin assistants end to end — permissions, confirmations, guest carts, limits, embeddings, channel-aware prices, business insights and custom providers — against a real Postgres database.

## License

AGPL-3.0 — see [LICENSE](./LICENSE).
