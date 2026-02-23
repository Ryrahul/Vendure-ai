# Task: Migrate AI Assistant to Vercel AI SDK + Add Checkout Tools

This document describes the work to migrate the existing AI chat from the direct OpenAI client to the **Vercel AI SDK** and to add **checkout tools** (shipping address, billing address, shipping method) so the assistant can guide users through the order process up to the shipping step.

---

## 1. References

- **Current implementation:** `apps/server/src/plugins/ai-assistant-plugin/services/ai-chat.service.ts` (OpenAI chat completions + 9 tools, no streaming).
- **Agent context:** `AGENT.md` — architecture, tools, response format, auth.
- **Vendure:** Use [Vendure Shop API docs](https://docs.vendure.io/reference/graphql-api/shop/mutations) and [Checkout flow guide](https://docs.vendure.io/guides/storefront/checkout-flow/). For up-to-date docs/code examples, use the **Context7 MCP** server (configured in `.cursor/mcp.json`).
- **Storefront checkout:** `apps/storefront/src/app/checkout/actions.ts` (setShippingAddress, setBillingAddress, setShippingMethod, etc.) and `apps/storefront/src/lib/vendure/queries.ts` (GetEligibleShippingMethodsQuery, GetAvailableCountriesQuery), `mutations.ts` (SetOrderShippingAddressMutation, SetOrderBillingAddressMutation, SetOrderShippingMethodMutation).
- **Vercel AI SDK:** [streamText](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text), [Tool calling](https://sdk.vercel.ai/docs/guides/tool-calling), [useChat](https://sdk.vercel.ai/docs/reference/ai-sdk-react/use-chat).

---

## 2. Migration: From OpenAI Client to Vercel AI SDK

### 2.1 Goals

- Replace direct `openai.chat.completions.create()` (and manual tool-call loop) with Vercel AI SDK’s `streamText` or `generateText` and SDK tool definitions.
- Optionally support **streaming** so the frontend can show tokens as they arrive.
- Keep all existing behavior: system prompt, 9 existing tools, structured response (message, products, collections, addToCartAction, orders, activeOrder), auth/session handling.

### 2.2 Backend (Vendure plugin – NestJS)

- **Location:** `apps/server/src/plugins/ai-assistant-plugin/services/ai-chat.service.ts` (and possibly controller).
- **Changes:**
  - Add dependencies: `ai`, `@ai-sdk/openai` (and optionally `zod` for tool schemas).
  - Replace `OpenAI` client + hand-rolled tool-call loop with:
    - **Option A (streaming):** `streamText()` from `ai` with `tools` and `maxSteps` (for multi-step tool calls). Consume the stream and either:
      - Return a `ReadableStream` from the REST endpoint and proxy it through the Next.js route, or
      - Accumulate full response and then return the same JSON shape as today for minimal frontend change.
    - **Option B (non-streaming):** `generateText()` with `tools` and `maxSteps`, then return the same JSON shape as today.
  - Map existing TOOLS (searchProducts, vectorSearch, getCollections, filterByPrice, addToCart, getActiveOrder, adjustOrderLine, getOrderHistory, trackOrder) to AI SDK tool definitions (e.g. using `tool()` and parameter schemas).
  - Keep tool execution in the same service (executeTool → toolSearchProducts, toolVectorSearch, etc.); the SDK will call the same handlers.
  - Preserve `RequestContext`, `customerId`, and error handling; ensure auth/session behavior is unchanged.
- **Controller:** If streaming is adopted, either return a streaming response (e.g. `StreamingTextResponse` or raw stream) from `POST /ai-assistant/chat` or keep returning a single JSON body (current behavior).

### 2.3 Frontend (Next.js)

- **Locations:**  
  - `apps/storefront/src/app/api/ai-assistant/chat/route.ts`  
  - `apps/storefront/src/components/chat/chat-panel.tsx`
- **Changes:**
  - Add dependencies: `ai`, `@ai-sdk/react`, and optionally `@ai-sdk/openai` if the frontend calls OpenAI directly (otherwise the route just proxies to the backend).
  - If backend returns a **stream:** use `useChat()` from `@ai-sdk/react` with `api: '/api/ai-assistant/chat'`, and render streamed content. Merge tool results (products, collections, addToCartAction, orders, activeOrder) from the final response or from a custom body/attachment so the UI still shows product cards, cart, etc.
  - If backend keeps **single JSON response:** the frontend can stay with the current `fetch` + `setMessages` approach, or still switch to `useChat()` with a custom `body` and `onFinish` to read the backend JSON and update products/collections/cart/orders.
- Ensure existing behavior is preserved: product cards, collections, add-to-cart action handling, cart summary, order history, and auth (e.g. forwarding auth token to the API).

### 2.4 API contract

- **Request:** Keep current shape: `{ message: string, history?: { role: 'user' | 'assistant', content: string }[] }`.
- **Response (non-streaming):** Keep current shape: `{ message, products, collections, addToCartAction?, orders?, activeOrder? }`. If streaming, either send this as a final JSON payload in the stream or via a separate mechanism so the UI can show products/cart/orders.

---

## 3. New Checkout Tools (Through Shipping Step)

Add tools so the assistant can guide the user through **setting shipping address, billing address, and shipping method** (order process up to the shipping step). Use Vendure’s Shop API semantics; implement either by calling Vendure’s OrderService on the server (if available in your setup) or by returning **action signals** for the frontend to run the existing checkout mutations (same pattern as `addToCart`).

### 3.1 Vendure context

- **Mutations (Shop API):** `setOrderShippingAddress`, `setOrderBillingAddress`, `setOrderShippingMethod` (see storefront `mutations.ts` and [Vendure mutations](https://docs.vendure.io/reference/graphql-api/shop/mutations)).
- **Queries:** `eligibleShippingMethods`, `availableCountries` (see storefront `queries.ts`).
- **Checkout flow:** Set shipping address → optionally billing address → get eligible shipping methods → set shipping method. Order state transitions (e.g. to ArrangingPayment) can be a later phase.

### 3.2 New tools to implement

1. **getEligibleShippingMethods**  
   - **Description:** Get available shipping methods for the current active order (after address is set).  
   - **Parameters:** None (or optional orderId if you support multiple orders).  
   - **Backend:** Call Vendure’s `eligibleShippingMethods` (e.g. via OrderService or internal query) or return an action for the frontend to run `GetEligibleShippingMethodsQuery`.  
   - **Returns:** List of `{ id, name, code, description, priceWithTax }` (or equivalent) so the LLM can describe options and recommend one.

2. **setShippingAddress**  
   - **Description:** Set the shipping address on the active order.  
   - **Parameters:** Address fields matching `CreateAddressInput`: fullName, streetLine1, streetLine2?, city, province, postalCode, countryCode, phoneNumber, company?.  
   - **Backend:** Either call OrderService (if exposed in server) or return an action object for the frontend to call `setShippingAddress` from `checkout/actions.ts`.  
   - **Returns:** Success or error message; optionally updated order summary.

3. **setBillingAddress**  
   - **Description:** Set the billing address on the active order (can be same as shipping).  
   - **Parameters:** Same as setShippingAddress (`CreateAddressInput`).  
   - **Backend:** Same pattern as setShippingAddress; use `setOrderBillingAddress` or frontend action.  
   - **Returns:** Success or error message.

4. **setShippingMethod**  
   - **Description:** Set the chosen shipping method on the active order.  
   - **Parameters:** `shippingMethodId` (string, required) — ID from `getEligibleShippingMethods`.  
   - **Backend:** Either call OrderService or return an action for the frontend to call `setShippingMethod(shippingMethodId)` from `checkout/actions.ts`.  
   - **Returns:** Success or error; optionally updated order total (e.g. shipping cost).

5. **getAvailableCountries** (optional but helpful)  
   - **Description:** List countries available for address selection (for forms or suggestions).  
   - **Parameters:** None.  
   - **Backend:** Query `availableCountries` (OrderService or Shop API).  
   - **Returns:** List of `{ id, code, name }`.

### 3.3 Tool execution and auth

- All checkout tools require an **authenticated customer session** (same as getActiveOrder, adjustOrderLine, getOrderHistory, trackOrder).
- If there is no active order, return a clear error and suggest adding items first.
- Validate address fields (e.g. required fields, countryCode) before calling Vendure; return clear errors for the LLM to relay to the user.

### 3.4 System prompt and response shape

- Update the **system prompt** in `ai-chat.service.ts` (or equivalent) to describe the new tools and when to use them (e.g. “Use getEligibleShippingMethods after the customer has set their address”, “Use setShippingMethod with the id from getEligibleShippingMethods”).
- If you use **action signals** for setShippingAddress / setBillingAddress / setShippingMethod, extend the response type (e.g. `setShippingAddressAction`, `setBillingAddressAction`, `setShippingMethodAction`) and document them in `AGENT.md`. The frontend should then call the existing checkout server actions when these are present.

---

## 4. Implementation Checklist

- [ ] **Vercel AI SDK – backend**  
  - [ ] Add `ai`, `@ai-sdk/openai` (and optionally `zod`) to the server app.  
  - [ ] Refactor `AiChatService.chat()` to use `streamText` or `generateText` with SDK tool definitions.  
  - [ ] Map all 9 existing tools to SDK tools and keep current executeTool behavior.  
  - [ ] Preserve request/response shape and auth/session handling.  
  - [ ] (Optional) Expose a streaming response from the controller and document how the frontend consumes it.

- [ ] **Vercel AI SDK – frontend**  
  - [ ] Add `ai`, `@ai-sdk/react` (and optionally `@ai-sdk/openai`) to the storefront.  
  - [ ] Use `useChat()` and, if applicable, handle streaming while still showing products/collections/cart/orders (e.g. from final message or custom body).  
  - [ ] Keep auth token forwarding and existing UI (product cards, add-to-cart, cart summary, order history).

- [ ] **Checkout tools – backend**  
  - [ ] Implement getEligibleShippingMethods (query eligible methods for active order).  
  - [ ] Implement setShippingAddress (server-side or action signal).  
  - [ ] Implement setBillingAddress (server-side or action signal).  
  - [ ] Implement setShippingMethod (server-side or action signal).  
  - [ ] (Optional) Implement getAvailableCountries.  
  - [ ] Enforce auth and active-order checks; validate address/shippingMethodId and return clear errors.

- [ ] **Checkout tools – system prompt & types**  
  - [ ] Update system prompt with new tools and usage rules.  
  - [ ] Extend response types and controller/API contract if using action signals for checkout.  
  - [ ] Update `AGENT.md` with new tools and response fields.

- [ ] **Docs & tests**  
  - [ ] Update `AGENT.md` with Vercel AI SDK architecture and new checkout tools.  
  - [ ] Add or adjust tests for new tools and, if possible, for the migrated chat flow.

---

## 5. Delegation

This task is intended to be **delegated to another AI or developer**. Use this file as the single source of truth for:

- What to migrate (OpenAI → Vercel AI SDK).
- What new tools to add (checkout through shipping).
- Where to look (file paths, Vendure docs, storefront actions).
- What to preserve (auth, response shape, existing tools and UI).

Refer to **Vendure** via [docs.vendure.io](https://docs.vendure.io) and the **Context7 MCP** for current API details, and to **Vercel AI SDK** docs for `streamText`, `generateText`, and `useChat`.
