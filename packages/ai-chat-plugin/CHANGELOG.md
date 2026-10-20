# Changelog

## 0.5.0

> **Database:** adds the `ai_store_profile` table. With `synchronize: false`, generate and run a migration (`npx vendure migrate`).

### Added

- **Business insights in the admin chat.** New admin tools: `getSalesSummary`, `getSalesTrend`, `getTopSellingProducts`, `getCustomerLocations`, `forecastSales` (30-day forecast with a likely range and accuracy measured on the store's own history), `getInventoryPlan` (reorder status and quantities from sales rate, supplier lead time and safety stock), `getStoreProfile` / `updateStoreProfile`, `searchWeb` and `fetchWebPage` (SSRF-guarded) for competitor and pricing research. Each is gated by the matching permission. Results come back as structured `insights` (charts/tables in `@rahul_vendure/ai-chat-dashboard` 0.4.0), and only a text summary is sent to the model.
- **Any model provider.** `chatModel` accepts any AI SDK model instance (Anthropic, Google, self-hosted OpenAI-compatible servers such as Ollama/vLLM, DeepSeek, OpenRouter…). Azure OpenAI can be the primary chat model (no OpenAI key needed); `azureOpenai` accepts `baseURL` and `apiVersion`.
- **Any embeddings.** `embeddingModel` accepts any AI SDK embedding model; `embedTexts` takes your own function; `embeddingDimensions` sizes the vector columns.
- **Web search on Azure too.** Without `openaiApiKey`, the admin assistant uses the Azure deployment's built-in web search; or plug in your own with the `webSearch` option (Tavily, Brave, SerpAPI…). `enableWebResearch: false` turns web research off.
- **The assistant works things out instead of asking.** The store location is inferred from where orders ship (or the channel's tax/shipping zone) until one is saved; with no sales, research uses catalog products. Assumptions are stated in one line, never as a questionnaire.

### Changed

- `openaiApiKey` is optional when other providers cover chat and embeddings.
- The server and worker now check the model configuration when they start: with no chat model or no embedding source they stop with a clear error instead of failing on the first chat. (A setup like `openaiApiKey: process.env.OPENAI_API_KEY ?? ''` with the variable unset now stops at startup.) Loading the config without keys — e.g. the dashboard's `vite build` — still works.
- Embeddings use the AI SDK (`embedMany`) instead of the `openai` client, and fail with a clear message when the model's vector size doesn't match `embeddingDimensions`.
- Chat history records the model name of non-OpenAI models as `provider:modelId`.

### Fixed

- **Replies vanished in storefronts with Azure OpenAI.** Azure adds provider metadata to stream chunks, which `useChat` clients on older `ai` 6.x reject — cancelling the stream silently. The shop stream no longer includes provider metadata.
- **Admin product tools ignored the active channel.** Product search, details and semantic search showed products from every channel, with the first price found (often another channel's, in another currency) labelled in the current currency. They now show only the channel's products with its own prices, and say whether prices include tax.
- Insight tools send no card when there is no data (no more empty "Top products" boxes in channels without sales).

## 0.4.1

### Fixed

- Carts (`activeOrder`) and orders returned to the frontend now include `currencyCode`, so widgets can show prices in the store currency.
- README: tool counts and `searchProducts` description were out of date (search uses the configured engine since 0.3.0); variant embeddings are no longer mentioned as generated.

## 0.4.0

> **Database:** adds a nullable `contentHash` column to `product_embedding` and `collection_embedding`. With `synchronize: false`, generate and run a migration (`npx vendure migrate`).

### Added

- **Guest carts.** Cart, checkout and coupon tools now work for guests: the active order is resolved with `ActiveOrderService` (like the Shop API `activeOrder` query, honouring custom `ActiveOrderStrategy`s) instead of requiring a logged-in customer.
- **Usage limits** (`limits` option, on by default): per-minute message limits per shopper (customer/session/IP), per IP, and per administrator, plus daily token budgets. Exceeding them returns HTTP 429.
- **Transactions for write tools.** Shop cart/checkout writes and admin writes run in a transaction and are rolled back if they throw or report a failure (no more half-created products from a failed `createProductWithVariants`).

### Changed

- **Embeddings are batched and incremental.** Catalog changes are debounced and embedded together (`embedMany`, 100 texts per request); a content hash skips unchanged products/collections, so price/stock changes and re-running `triggerEmbedAll` cost nothing. HTML is stripped from descriptions. Soft-deleted products are no longer embedded.
- **Variant embeddings are no longer generated** (they were never used for search and cost one OpenAI call per variant change). The table is kept.
- Order line ids are no longer required to be numeric (UUID id strategies work).
- Token usage now counts every step of a multi-step tool run (`totalUsage`), not just the last one.
- Cart, checkout, promotion and admin tool summaries show prices in the shopper's/channel currency instead of always `$` (search was fixed in 0.3.0).

## 0.3.1

### Fixed

- A confirmed admin action that failed (tools report failures as text, e.g. "Error deleting product…") was reported as successful. `POST /admin-ai-chat/confirm` now returns `success: false` for those.
- System prompts are passed through the AI SDK `system` option instead of as a `system` message (the SDK flags the latter as a prompt-injection risk).
- `package.json` is now exported, so tools that `require('@rahul_vendure/ai-chat-plugin/package.json')` work.

## 0.3.0

### Security

- **Admin chat now requires authentication and permissions.** All `/admin-ai-chat/*` routes require the new `UseAiAdminAssistant` permission (SuperAdmins have it). Previously they were reachable without authentication, giving anyone access to write-capable admin tools.
- **Admin tools require the matching Vendure permission** in the active channel (mirroring the Admin API). Tools the administrator cannot use are hidden from the model.
- **Admin chat sessions are private to their owner** (list, read, continue, delete). Previously any session could be read or deleted by id, and listing without a token returned every administrator's sessions.
- **`triggerEmbedAll` requires `UpdateCatalog` or `UpdateProduct`.** Previously it was public.
- **Shop conversations are scoped to their owner.** The React hook used `useId()`, which is identical for every visitor, so all shoppers shared one cached conversation. Conversation ids are now random per visitor, and the server keys the cache by customer or session.
- **Coupon codes are no longer revealed** by `getAvailablePromotions` unless `exposeCouponCodes: true`, and promotions are limited to the shopper's channel (previously every channel's codes were returned).
- Client-supplied history can no longer inject `system` messages; history and message length are capped. `currentPage` is validated before it reaches the admin system prompt. The system prompt tells the model to treat tool output as data.

### Added

- **Human confirmation for destructive admin actions.** Deletes and changes to administrators, roles, channels, global settings and payment methods are never executed by the model: the tool call creates a pending action and the dashboard shows Confirm / Cancel. Only `POST /admin-ai-chat/confirm` (the button, which the model cannot call) runs it — bound to the requesting administrator, single-use, expiring after 10 minutes, re-checking permissions, refusing other channels, and running in a transaction. `POST /admin-ai-chat/cancel` discards it. Outcomes are recorded in the chat session. Configure with `adminToolsRequiringConfirmation`.

### Changed

- **Product search uses the store's configured search engine** through the Shop API (DefaultSearchPlugin, Elasticsearch, Typesense, Meilisearch, …) instead of a private deep import of DefaultSearchPlugin with an unscoped raw-SQL fallback. Channel, language, currency, enabled and deleted rules now always apply.
- Semantic search results are hydrated through the Shop API, so hidden products are never suggested.
- Price filters use tax-inclusive prices and are pushed down to engines that support `priceRangeWithTax`; prices are formatted in the channel currency instead of always `$`.
- Shop endpoints use Vendure's `@Ctx()`/`@Allow()`, so cookie sessions and channel tokens work. The React widget has a new `channelToken` option.
- Streaming stops when the shopper disconnects; cached history keeps tool summaries so follow-up actions (e.g. add to cart) still have variant ids.
- New options: `chatModel`, `shopApiUrl`, `exposeCouponCodes`, `maxMessageLength`, `maxHistoryMessages`.
- Peer dependency is now `@vendure/core >=3.1.0 <4.0.0` (CacheService requires 3.1).

### Added

- e2e test suite (`npm test`, Postgres + pgvector): storefront search, a custom search engine, security, admin confirmations (35 tests), plus an opt-in real-model test (`OPENAI_API_KEY_E2E`). Verified on Vendure 3.5.4 and 3.8.0.
