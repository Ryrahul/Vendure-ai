# Vendure AI Commerce Agent
## Intelligent Shopping Assistant with LLM Orchestration

---

## Migration: Vercel AI SDK + Checkout Tools (COMPLETED)

The assistant has been migrated from the **direct OpenAI client** to the **Vercel AI SDK** (`streamText` + `tool()` with zod schemas + `stepCountIs()` for multi-step tool calling). **Checkout tools** (shipping address, billing address, shipping method, eligible shipping methods, available countries) have been added. The frontend uses `useChat()` from `@ai-sdk/react` with `DefaultChatTransport` for real-time streaming. See `task.md` for the original spec.

---

## Purpose

This AI Agent is a **proper ecommerce shopping assistant** for Vendure that:

- Has natural conversations about the store, products, and shopping
- Uses LLM (GPT-4o-mini) with tool calling to intelligently find products
- Searches products via keyword search, semantic/vector search, collection browsing, and price filtering
- Adds items to cart through conversational interaction
- Lets customers view, adjust, and manage their cart (view cart, change quantities, remove items)
- Lets customers view their order history and track orders (requires login)
- Politely refuses off-topic questions (politics, celebrities, general knowledge, etc.)
- Never fabricates product data — all product info comes from the database
- Maintains conversation context across multiple messages

### Authentication Requirement

The AI assistant **only works for logged-in customers**. The chat endpoint must receive a valid session token (via cookie or bearer token) from the authenticated customer. If no active customer session is found, the assistant should return an error prompting the user to log in. This ensures:
- Order history and tracking are scoped to the authenticated customer
- Cart operations are tied to the correct customer session
- No anonymous users can access order-related features

---

## Architecture Overview

```
User Message + Auth Token (cookie/bearer)
       ↓
Next.js API Route (proxy, forwards auth headers)
  - Extracts latest user message + history from useChat() messages array
  - Forwards to Vendure streaming endpoint
       ↓
Vendure REST Controller
  - POST /ai-assistant/stream (streaming, AI SDK UI message stream protocol)
  - POST /ai-assistant/chat (non-streaming JSON, backward compatible)
  - Extracts authenticated customer session from request
       ↓
AiChatService.streamChat() (Vercel AI SDK)
       ↓
streamText() with GPT-4o-mini
  - System prompt (store-focused, off-topic rejection)
  - 14 tool definitions (zod schemas + execute functions)
  - stopWhen: stepCountIs(5) for multi-step tool calling
       ↓
LLM decides: respond directly OR call tools
       ↓
If tool calls → SDK auto-executes tool functions → returns results to LLM
  - Product tools: search DB directly
  - Order tools: query via OrderService with customer's session context
  - Cart tools: add to cart (action signal), view/adjust cart (server-side)
  - Checkout tools: set addresses, get/set shipping methods (server-side via OrderService)
       ↓
LLM formats final conversational response (streamed to frontend)
       ↓
Stream: UI message stream with text parts + tool invocation parts (products, collections, cart, orders, checkout actions)
```

---

## Core Concepts

### 1. AI as Orchestrator
The LLM (GPT-4o-mini) orchestrates the conversation:
- Understands user intent (product search, browsing, chitchat, off-topic)
- Decides which tools to call (or none for general store chat)
- Formats a natural, conversational response
- Rejects off-topic questions politely

### 2. Backend as Executor
Vendure services handle all data retrieval:
- Product search (keyword matching on name/description)
- Vector/semantic search (pgvector embeddings)
- Collection browsing
- Price filtering
- Cart operations (add to cart via frontend action signals, view/adjust/remove via OrderService)
- Order history & tracking (via Vendure Shop API, scoped to logged-in customer)
- No hallucinated data — empty results are reported honestly

### 3. Store-Only Conversation Scope
The bot ONLY discusses:
- Products, collections, prices
- Store-related topics (shipping, returns, how to shop)
- Shopping assistance (gift suggestions, recommendations)
- Cart management (view cart, adjust quantities, remove items)
- Order history and order tracking (for logged-in customers)

The bot REFUSES to discuss:
- General knowledge (who is Elon Musk, capital of France)
- Politics, news, celebrities, science
- Any topic unrelated to the store

---

## Supported Tools

### 1. searchProducts
**Description:** Keyword-based product search across name and description.

**Parameters:**
```json
{
  "query": "string (required) — search term",
  "take": "number (optional) — max results, default 10"
}
```

**Use for:** "laptop", "gaming mouse", "headphones", "wireless earbuds"

### 2. vectorSearch
**Description:** Semantic search using OpenAI embeddings + pgvector similarity. Finds products by intent/meaning rather than exact keywords.

**Parameters:**
```json
{
  "query": "string (required) — semantic query"
}
```

**Use for:** "gift for dad", "something romantic", "minimal aesthetic", "cozy winter vibes"

### 3. getCollections
**Description:** List available product collections/categories.

**Parameters:**
```json
{
  "query": "string (optional) — filter collections by name"
}
```

**Use for:** "what categories do you have", "show collections", "browse electronics"

### 4. filterByPrice
**Description:** Filter products by price range/budget. Uses Vendure's FulltextSearchService for keyword matching (supports collection names like "electronics", facets, etc.) and applies price filtering in memory. Falls back to a raw DB query with collection name matching when the search service is unavailable.

**Parameters:**
```json
{
  "minPrice": "number (optional) — min price in smallest currency unit",
  "maxPrice": "number (optional) — max price in smallest currency unit",
  "query": "string (optional) — keyword to narrow results (matches product names, descriptions, and collection names)"
}
```

**Use for:** "under $50", "between 100 and 200", "laptop under 500", "electronics under 50", "my budget is 30k"

### 5. addToCart
**Description:** Adds a product variant to the customer's cart. Returns an action signal for the frontend to execute the actual `addItemToOrder` mutation with the customer's session. The LLM must confirm product name, price, and quantity with the user before calling this tool.

**Parameters:**
```json
{
  "variantId": "string (required) — numeric variant ID from a prior search",
  "quantity": "number (optional) — default 1",
  "productName": "string (optional) — product name for confirmation"
}
```

**Use for:** "add this to my cart", "I'll take 2 of those", "buy the first one"

### 6. getOrderHistory
**Description:** Fetches the logged-in customer's past orders. Uses the Vendure Shop API `activeCustomer { orders }` query. Returns a list of orders with code, state, total, date placed, and line items. **Requires authenticated customer session.**

**Parameters:**
```json
{
  "take": "number (optional) — max orders to return, default 5",
  "skip": "number (optional) — offset for pagination"
}
```

**Vendure API:** `activeCustomer { orders(options: { take, skip, sort: { orderPlacedAt: DESC } }) { items { id code state totalWithTax orderPlacedAt lines { productVariant { name } quantity } } } }`

**Use for:** "show my orders", "what have I ordered before", "my recent purchases", "order history"

### 7. trackOrder
**Description:** Gets the current status and tracking information for a specific order. Uses the Vendure Shop API `order(id)` query (only returns orders belonging to the authenticated customer). Returns order state, fulfillment status, tracking code, and shipping details. **Requires authenticated customer session.**

**Parameters:**
```json
{
  "orderId": "string (optional) — order ID",
  "orderCode": "string (optional) — order code (e.g. 'A1B2C3')"
}
```

**Vendure API:** `order(id) { code state orderPlacedAt totalWithTax fulfillments { state method trackingCode } shippingAddress { fullName streetLine1 city postalCode country } lines { productVariant { name } quantity } }`

**Use for:** "where's my order", "track order A1B2C3", "what's the status of my last order", "has my order shipped"

### 8. getActiveOrder
**Description:** Fetches the customer's current shopping cart (active order) with all line items. Uses Vendure's `OrderService.getActiveOrderForUser()` to get the order in `AddingItems` state. Returns line items with product names, quantities, prices, orderLineIds, and the cart total. **Requires authenticated customer session.**

**Parameters:**
```json
{}
```
No parameters — always returns the current active order for the authenticated user.

**Use for:** "what's in my cart", "show me my cart", "cart summary", "review my cart", "how much is my cart total"

### 9. adjustOrderLine
**Description:** Adjusts the quantity of an existing line item in the customer's cart, or removes it. Uses Vendure's `OrderService.adjustOrderLine()` or `OrderService.removeItemFromOrder()`. Requires the `orderLineId` from `getActiveOrder` results. Setting quantity to 0 removes the item. **Requires authenticated customer session.**

**Parameters:**
```json
{
  "orderLineId": "string (required) — order line ID from getActiveOrder results",
  "quantity": "number (required) — new absolute quantity (0 to remove)"
}
```

**Use for:** "remove that from my cart", "change quantity to 3", "I want 2 of those instead", "remove the laptop from my cart"

---

## Checkout tools (IMPLEMENTED)

These tools allow the assistant to guide users through the order process up to the **shipping step**. They execute server-side via Vendure's `OrderService`.

| Tool | Description | Parameters |
|------|-------------|------------|
| **getAvailableCountries** | List countries available for address selection. | None. |
| **getEligibleShippingMethods** | Get available shipping methods for the active order (after address is set). | None. |
| **setShippingAddress** | Set shipping address on the active order via `OrderService.setShippingAddress()`. | fullName, streetLine1, streetLine2?, city, province, postalCode, countryCode, phoneNumber, company?. |
| **setBillingAddress** | Set billing address on the active order via `OrderService.setBillingAddress()`. | Same as setShippingAddress. |
| **setShippingMethod** | Set chosen shipping method on the active order via `OrderService.setShippingMethod()`. | `shippingMethodId` (string, from getEligibleShippingMethods). |

All require an **authenticated customer** and an **active order**. Address/shipping method operations execute server-side and also return action signals (e.g. `setShippingAddressAction`) that the frontend can use to refresh checkout state.

---

## User Intent → Behavior Mapping

| User says | Bot behavior |
|-----------|-------------|
| "Hi", "Hello" | Greets warmly, asks how it can help |
| "What do you sell?" | Calls getCollections, describes the store |
| "laptop", "gaming mouse" | Calls searchProducts with keyword |
| "gift for my photographer friend" | Calls vectorSearch for semantic match |
| "suggest me some laptops" | Calls searchProducts with keyword |
| "I need something for my house" | Calls vectorSearch for semantic match |
| "under $50" | Calls filterByPrice |
| "laptop under 500" | Calls searchProducts + filterByPrice |
| "show me collections" | Calls getCollections |
| "add this to my cart" | Calls addToCart with variant from context |
| "what's in my cart?" | Calls getActiveOrder |
| "remove the laptop from my cart" | Calls getActiveOrder (if needed), then adjustOrderLine with quantity 0 |
| "change quantity to 3" | Calls getActiveOrder (if needed), then adjustOrderLine with quantity 3 |
| "show my orders" | Calls getOrderHistory |
| "where's my order?" | Calls trackOrder (latest order or by code) |
| "track order A1B2C3" | Calls trackOrder with orderCode |
| "has my order shipped?" | Calls trackOrder, reports fulfillment state |
| "Who is Elon Musk?" | Politely refuses, redirects to shopping |
| "Write me a poem" | Politely refuses, redirects to shopping |
| "Do you have returns?" | Answers with general store info (no tool needed) |
| *(Phase 2)* "Set my shipping address to …" | setShippingAddress with collected address |
| *(Phase 2)* "Use the same for billing" | setBillingAddress (same as shipping) |
| *(Phase 2)* "What shipping options do I have?" | getEligibleShippingMethods, then describe options |
| *(Phase 2)* "Use standard shipping" / "Pick the first one" | setShippingMethod with chosen id |

**When tools return no products:** Bot honestly says no matching products were found. Never invents products.

---

## Structured Response Format

The backend always returns:
```json
{
  "message": "string — conversational response from the LLM",
  "products": [
    {
      "id": "string",
      "name": "string",
      "slug": "string",
      "price": "number (smallest currency unit)",
      "image": "string | null",
      "variantId": "string"
    }
  ],
  "collections": [
    {
      "id": "string",
      "name": "string",
      "slug": "string"
    }
  ],
  "addToCartAction": {
    "variantId": "string",
    "quantity": "number",
    "productName": "string"
  },
  "orders": [
    {
      "id": "string",
      "code": "string",
      "state": "string",
      "total": "number",
      "orderPlacedAt": "string (ISO date)",
      "lines": [
        {
          "productName": "string",
          "quantity": "number"
        }
      ],
      "fulfillments": [
        {
          "state": "string",
          "method": "string",
          "trackingCode": "string | null"
        }
      ]
    }
  ],
  "activeOrder": {
    "id": "string",
    "code": "string",
    "totalQuantity": "number",
    "totalWithTax": "number (smallest currency unit)",
    "lines": [
      {
        "orderLineId": "string",
        "productName": "string",
        "variantId": "string",
        "quantity": "number",
        "linePriceWithTax": "number (smallest currency unit)"
      }
    ]
  }
}
```

Rules:
- All product data comes from the database
- Prices come from variant prices
- Images come from featuredAsset
- No fabricated data
- Empty arrays when no results

---

## Conversation History

The frontend sends conversation history with each request for multi-turn context:
```json
{
  "message": "current user message",
  "history": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ]
}
```

This allows the bot to understand context like:
- "Show me laptops" → "Now show me the cheaper ones" (understands "cheaper laptops")
- "What collections do you have?" → "Show me electronics" (understands context)
- "Show my cart" → "Remove the first one" (has orderLineIds from previous getActiveOrder)

The frontend enriches assistant messages in the history with product metadata (`variantId`, `price`) and cart data (`orderLineId`, `variantId`) so the LLM can reference these in subsequent turns without needing to call tools again.

---

## System Prompt Strategy

The system prompt enforces:
1. **Store-only scope** — only discuss products, shopping, store topics
2. **Tool usage** — always use tools for product data, never fabricate
3. **Off-topic rejection** — politely redirect non-store questions
4. **Honest empty results** — say "not found" when tools return nothing
5. **Natural conversation** — be friendly, concise, helpful
6. **Auth-aware tools** — order history and tracking tools require a logged-in customer; if no session, the LLM should inform the user to log in first

---

## Safety & Validation Rules

1. AI cannot generate products not in the database
2. Product IDs, prices, slugs all come from DB queries
3. Always respect Vendure channel context
4. Never expose internal DB fields
5. Off-topic questions are rejected (not answered with disclaimers)
6. Empty results are reported honestly
7. Conversation history is text-only (no tool call details sent to frontend)
8. **Authentication required** — the assistant only works for logged-in customers. The controller must extract the customer session from the request (cookie/bearer token) and pass it as a proper Vendure `RequestContext`. If no authenticated customer is found, return an error
9. Order data is strictly scoped to the authenticated customer — a customer can never see another customer's orders

---

## Plugin Configuration

```typescript
AiAssistantPlugin.init({
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    embeddingModel: 'text-embedding-3-small',
})
```

---

## Technical Stack

- **LLM:** OpenAI GPT-4o-mini via **Vercel AI SDK v6** (`streamText` + `tool()` with zod schemas + `stepCountIs()`)
- **AI SDK packages:** `ai@6.x`, `@ai-sdk/openai@3.x` (backend), `@ai-sdk/react@3.x` (frontend)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Vector DB:** pgvector extension in PostgreSQL
- **Backend:** Vendure plugin (NestJS controller + services). Streaming via `toUIMessageStreamResponse()`.
- **Frontend:** Next.js chat panel (React, shadcn/ui) using `useChat()` from `@ai-sdk/react` with `DefaultChatTransport`
- **Proxy:** Next.js API route → Vendure REST streaming endpoint (`/ai-assistant/stream`)
- **Vendure reference:** [Shop API](https://docs.vendure.io/reference/graphql-api/shop/mutations), [Checkout flow](https://docs.vendure.io/guides/storefront/checkout-flow/).

---

## Extensibility Roadmap

**Phase 2 (COMPLETED):**
- Migrated to **Vercel AI SDK v6** (`streamText` + `tool()` + `stepCountIs()`, streaming enabled).
- **Checkout tools:** setShippingAddress, setBillingAddress, getEligibleShippingMethods, setShippingMethod, getAvailableCountries — all execute server-side via OrderService.
- Frontend uses `useChat()` with `DefaultChatTransport` for real-time streaming.
- Tool results (products, collections, cart, checkout actions) are extracted from UI message parts on the frontend.

**Phase 3 (later):**
- Transition to payment & place order from chat (if desired)
- Personalized recommendations based on order history
- Analytics & conversation insights
- Multi-language support

---

## Scope Covered

- LLM-orchestrated product discovery with tool calling
- Keyword search (searchProducts)
- Semantic/vector search (vectorSearch)
- Collection browsing (getCollections)
- Budget/price filtering (filterByPrice)
- Add to cart (addToCart — frontend action signal)
- Cart summary (getActiveOrder — view current cart with line items, quantities, totals)
- Cart management (adjustOrderLine — change quantities, remove items from cart)
- Order history (getOrderHistory — authenticated customers)
- Order tracking (trackOrder — fulfillment state, tracking code)
- Authentication-gated access (logged-in customers only)
- Natural store conversations (greetings, store info, help)
- Off-topic rejection (polite redirects)
- Conversation history/context
- Structured safe output
- "Not available" when products not in catalog

**Not yet covered (Phase 3):**
- Payment / place order from chat
- Personalized recommendations based on order history
