# Vendure AI Commerce Agent – Phase 1
## Product Intelligence & Discovery Layer

---

## 🎯 Purpose

This AI Agent enables intelligent product discovery inside Vendure using:

- Natural language understanding
- Tool calling
- **Vendure SearchService** (DefaultSearchPlugin) + hybrid (keyword + vector)
- Structured responses
- Collection awareness
- Safe backend execution

This phase only supports:
- Product listing
- Product filtering (keyword, semantic, collection, price)
- **Budget / price intent** (e.g. "under 50k", "my budget is 30k")
- **Category / product-type intent** (e.g. "gaming laptop", "laptop")
- **Gift / intent-based discovery** (e.g. "gift for dad", "romantic gift")
- **Empty catalog handling**: when no products match, respond with "not available" — never fabricate

No cart or order mutations are included in this phase.

---

## 🧠 Architecture Overview

User Message
      ↓
LLM (Tool Calling Mode)
      ↓
Tool Selected?
  - search (Vendure SearchService)
  - searchProducts (keyword fallback)
  - vectorSearch
  - getCollectionProducts
  - filterByPrice
      ↓
Backend Executes Tool
      ↓
Structured Data Returned (or empty)
      ↓
If empty → message: "not available" / "not in catalog"
      ↓
LLM Formats Conversational Reply
      ↓
Return:
  - message
  - structured product list (or empty)

---

## 🔧 Core Concepts

### 1. AI as Orchestrator
The LLM does NOT access the database directly.

It only:
- Understands user intent
- Decides which tool to call
- Formats final response

All data retrieval is handled securely by backend services.

---

### 2. Backend as Executor
Vendure services are responsible for:

- Product retrieval (SearchService, ProductService)
- Filtering (term, collection, facets, price)
- Collection queries
- Price constraints (budget)
- Channel awareness

No hallucinated product data is allowed. When the catalog has no matching products, the backend returns an empty list and the agent replies that the product or criteria are not available.

---

## 🛠 Supported Tools

**Vendure way:** Prefer **search** (SearchService) for product discovery; it returns products from the same index as the storefront and supports term, collection, facets, and sort. Use other tools when combining with price or semantic intent.

---

### 1️⃣ search (Vendure SearchService)

Description:
Full-text product search using Vendure’s DefaultSearchPlugin / SearchService. This is the same search the storefront uses; results are channel-aware and come from the catalog index.

Parameters:
{
  term: string,
  collectionSlug?: string,
  take?: number,
  skip?: number,
  sort?: { name?: 'ASC'|'DESC', price?: 'ASC'|'DESC' }
}

Execution:
- Use SearchService.search() with SearchInput
- Apply channel filter (implicit)
- Return product list (e.g. top 10)

Use for:
- "gaming laptop", "laptop", "wireless mouse"
- Category or product-type queries
- When user names a product or category; combine with filterByPrice for budget (e.g. "laptop under 50k" → search(term: "laptop") + filterByPrice(maxPrice: 50000), or a single backend call that does both)

---

### 2️⃣ searchProducts

Description:
Keyword-based search across product name and description (ProductService or simple query). Use when not using SearchService or as fallback.

Parameters:
{
  query: string
}

Execution:
- Uses ProductService or equivalent
- Applies channel filter
- Returns top 10 products

---

### 3️⃣ vectorSearch

Description:
Semantic search using embeddings (e.g. pgvector).

Parameters:
{
  query: string
}

Execution:
- Convert query to embedding
- Use pgvector similarity
- Return top 5 products

Use for:
- "gift", "gift for dad", "romantic gift"
- "minimal aesthetic", "something for him/her"
- Intent-based discovery when no exact keyword

---

### 4️⃣ getCollectionProducts

Description:
Retrieve products from a specific collection.

Parameters:
{
  collectionSlug: string
}

Execution:
- Find collection by slug
- Retrieve assigned products
- Respect channel constraints

Use for:
- "Show winter collection"
- "What is in summer sale?"

---

### 5️⃣ filterByPrice

Description:
Filter products by price range (budget).

Parameters:
{
  minPrice?: number,
  maxPrice?: number
}

Execution:
- Join product variants
- Apply price constraints (channel-aware)
- Return filtered products

Use for:
- "my budget is 30k", "under 50k", "between 20k and 40k"
- Combine with search: e.g. search(term: "laptop") then filterByPrice(maxPrice: 50000), or one backend tool that accepts term + maxPrice

---

## 📋 User Intent → Tool Mapping

| User says | Primary tool(s) | Notes |
|-----------|-----------------|--------|
| "gaming laptop", "laptop", "wireless mouse" | **search** (term) | Vendure SearchService; returns catalog products only |
| "laptop under 50k", "under 50k", "my budget is 30k" | **filterByPrice** and optionally **search** | Parse budget (e.g. 50k → 50000); combine term + maxPrice when both apply |
| "gift", "gift for dad", "romantic gift" | **vectorSearch** | Semantic; if no results, reply not available |
| "winter collection", "summer sale" | **getCollectionProducts** (collectionSlug) | Resolve name → slug if needed |
| Generic "show me products" / category | **search** (term) or **getCollectionProducts** | Prefer search when user gives a product type |

**When tools return no products:** Always respond that the product or criteria are **not available** or **not in the catalog**. Never invent product names, prices, or slugs.

---

## 🗄 Data Model

### ProductEmbedding Entity

Stores vector representation of products.

Fields:
- id
- product (relation)
- embedding (pgvector)

Embedding generated on:
- Product creation
- Product update
- Description change

---

## 🔍 Search Strategy

Default Mode: Hybrid (Vendure way)

**Vendure way:** Use **SearchService** (DefaultSearchPlugin) for keyword/product search so the AI uses the same index and behavior as the storefront. Optionally combine with vector search for semantic intent.

Hybrid = Vendure search (keyword) + Vector

Flow:
1. For product/category terms → use search (SearchService) with `term`
2. For gift/intent queries → use vectorSearch
3. For budget → use filterByPrice (and optionally search with term)
4. Merge/deduplicate when combining tools
5. Return top ranked; if empty, return "not available"

Configurable via plugin options.

---

## 🧱 Structured Response Format

AI Agent must always return:

{
  message: string,
  products: [
    {
      id: ID,
      name: string,
      slug: string,
      price: number,
      image: string | null
    }
  ]
}

Rules:
- Price must come from database
- Slug must come from database
- Image must come from featuredAsset
- No fabricated data allowed
- **When no products match:** set `products: []` and set `message` to a clear "not available" / "not in catalog" reply (e.g. "We don't have any [X] in the catalog right now." or "No products found under that budget.")

---

## 🛡 Safety & Validation Rules

1. AI cannot generate products not present in database
2. Product IDs must be validated
3. Price must be read from variant
4. Always respect channel context
5. Never expose internal DB fields
6. **Empty results:** If a tool returns no products, respond that the item or criteria are not available; never suggest or invent products

---

## 🧠 Prompt Strategy

System Prompt:

"You are a shopping assistant for this store. 
Use tools when product data is required (search, vectorSearch, getCollectionProducts, filterByPrice). 
Prefer the Vendure search tool for product/category queries (e.g. 'gaming laptop', 'laptop under 50k' = search + price filter). 
Use vectorSearch for gift or intent-based queries (e.g. 'gift for dad'). 
Never fabricate products. 
Only respond using provided tool data. 
If a tool returns no products, say clearly that the product or criteria are not available / not in the catalog."

AI must:
- Call tools for data
- Not answer product questions without tool usage
- Reply "not available" / "not in catalog" when tools return empty results

---

## ⚙ Plugin Configuration (Phase 1)

Example:

AiAssistantPlugin.init({
  searchMode: 'hybrid',
  useVendureSearchService: true,  // Use DefaultSearchPlugin / SearchService for product search (Vendure way)
  embeddingsProvider: 'openai',
  maxResults: 10,
  enableCollections: true
})

---

## 🚀 Extensibility Roadmap

Future Phases:

Phase 2:
- Cart management tools
- Add to cart
- Remove from cart
- Cart summary

Phase 3:
- Order tracking
- Personalized recommendations
- Analytics
- Reranking models

---

## 📌 Design Philosophy

This is not a chatbot.

This is a:

AI Commerce Discovery Engine for Vendure.

It follows:

- Tool-driven architecture
- Strict backend validation
- Pluggable embeddings
- Vendor-neutral design
- Production-grade safety

---

## 🏁 End of Phase 1

Scope covered:
✔ Product discovery (Vendure SearchService + keyword)
✔ Semantic search (gift, intent-based)
✔ Collections
✔ Budget / price filtering ("under 50k", "my budget")
✔ Category / product-type queries ("gaming laptop", "laptop")
✔ Structured safe output
✔ "Not available" when products not in catalog

Not covered:
✖ Cart mutations
✖ Checkout
✖ Order management
