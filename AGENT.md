# Vendure AI Commerce Agent – Phase 1
## Intelligent Shopping Assistant with LLM Orchestration

---

## Purpose

This AI Agent is a **proper ecommerce shopping assistant** for Vendure that:

- Has natural conversations about the store, products, and shopping
- Uses LLM (GPT-4o-mini) with tool calling to intelligently find products
- Searches products via keyword search, semantic/vector search, collection browsing, and price filtering
- Politely refuses off-topic questions (politics, celebrities, general knowledge, etc.)
- Never fabricates product data — all product info comes from the database
- Maintains conversation context across multiple messages

---

## Architecture Overview

```
User Message + Conversation History
       ↓
Next.js API Route (proxy)
       ↓
Vendure REST Controller (POST /ai-assistant/chat)
       ↓
AiChatService
       ↓
OpenAI Chat Completions API (GPT-4o-mini)
  - System prompt (store-focused, off-topic rejection)
  - Conversation history
  - Tool definitions
       ↓
LLM decides: respond directly OR call tools
       ↓
If tool calls → execute against Vendure DB → return results to LLM
       ↓
LLM formats final conversational response
       ↓
Return: { message, products[], collections[] }
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
- No hallucinated data — empty results are reported honestly

### 3. Store-Only Conversation Scope
The bot ONLY discusses:
- Products, collections, prices
- Store-related topics (shipping, returns, how to shop)
- Shopping assistance (gift suggestions, recommendations)

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
**Description:** Filter products by price range/budget.

**Parameters:**
```json
{
  "minPrice": "number (optional) — min price in smallest currency unit",
  "maxPrice": "number (optional) — max price in smallest currency unit",
  "query": "string (optional) — keyword to narrow results"
}
```

**Use for:** "under $50", "between 100 and 200", "laptop under 500", "my budget is 30k"

---

## User Intent → Behavior Mapping

| User says | Bot behavior |
|-----------|-------------|
| "Hi", "Hello" | Greets warmly, asks how it can help |
| "What do you sell?" | Calls getCollections, describes the store |
| "laptop", "gaming mouse" | Calls searchProducts with keyword |
| "gift for dad" | Calls vectorSearch for semantic match |
| "under $50" | Calls filterByPrice |
| "laptop under 500" | Calls searchProducts + filterByPrice |
| "show me collections" | Calls getCollections |
| "Who is Elon Musk?" | Politely refuses, redirects to shopping |
| "Write me a poem" | Politely refuses, redirects to shopping |
| "Do you have returns?" | Answers with general store info (no tool needed) |

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
      "image": "string | null"
    }
  ],
  "collections": [
    {
      "id": "string",
      "name": "string",
      "slug": "string"
    }
  ]
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

---

## System Prompt Strategy

The system prompt enforces:
1. **Store-only scope** — only discuss products, shopping, store topics
2. **Tool usage** — always use tools for product data, never fabricate
3. **Off-topic rejection** — politely redirect non-store questions
4. **Honest empty results** — say "not found" when tools return nothing
5. **Natural conversation** — be friendly, concise, helpful

---

## Safety & Validation Rules

1. AI cannot generate products not in the database
2. Product IDs, prices, slugs all come from DB queries
3. Always respect Vendure channel context
4. Never expose internal DB fields
5. Off-topic questions are rejected (not answered with disclaimers)
6. Empty results are reported honestly
7. Conversation history is text-only (no tool call details sent to frontend)

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

- **LLM:** OpenAI GPT-4o-mini (chat completions with tool calling)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Vector DB:** pgvector extension in PostgreSQL
- **Backend:** Vendure plugin (NestJS controller + services)
- **Frontend:** Next.js chat panel (React, shadcn/ui)
- **Proxy:** Next.js API route → Vendure REST endpoint

---

## Extensibility Roadmap

**Phase 2:**
- Cart management tools (add to cart, remove, summary)
- Order-related queries

**Phase 3:**
- Order tracking
- Personalized recommendations
- Analytics & conversation insights
- Streaming responses

---

## Scope Covered (Phase 1)

- LLM-orchestrated product discovery with tool calling
- Keyword search (searchProducts)
- Semantic/vector search (vectorSearch)
- Collection browsing (getCollections)
- Budget/price filtering (filterByPrice)
- Natural store conversations (greetings, store info, help)
- Off-topic rejection (polite redirects)
- Conversation history/context
- Structured safe output
- "Not available" when products not in catalog

**Not covered:**
- Cart mutations
- Checkout
- Order management
- Streaming responses
