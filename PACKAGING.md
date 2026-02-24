# Packaging Plan: Distributable Vendure AI Chat

This document outlines the plan to extract the AI Shopping Assistant into two distributable packages that other Vendure users can install and use.

---

## Overview

| Package | Purpose | Install |
|---|---|---|
| `@vendure/ai-chat-plugin` | Backend Vendure plugin — LLM, tools, streaming endpoint | `npm i @vendure/ai-chat-plugin` |
| `@vendure/ai-chat-react` | Frontend React component — drop-in chat UI | `npm i @vendure/ai-chat-react` |

---

## Package 1: `@vendure/ai-chat-plugin` (Backend)

### Structure

```
@vendure/ai-chat-plugin/
├── src/
│   ├── ai-assistant.plugin.ts          # VendurePlugin definition
│   ├── constants.ts                    # options interface, defaults
│   ├── controllers/
│   │   └── ai-assistant.controller.ts  # POST /stream + POST /chat endpoints
│   ├── services/
│   │   ├── ai-chat.service.ts          # LLM orchestration, tool definitions
│   │   ├── embedding.service.ts        # OpenAI embeddings
│   │   ├── product-embedding.service.ts
│   │   ├── collection-embedding.service.ts
│   │   └── variant-embedding.service.ts
│   ├── entities/
│   │   ├── product-embedding.entity.ts
│   │   ├── variant-embedding.entity.ts
│   │   └── collection-embedding.entity.ts
│   └── index.ts                        # public API exports
├── package.json
├── tsconfig.json
└── README.md
```

### Usage

```ts
// vendure-config.ts
import { AiAssistantPlugin } from '@vendure/ai-chat-plugin';

export const config: VendureConfig = {
  plugins: [
    AiAssistantPlugin.init({
      openaiApiKey: process.env.OPENAI_API_KEY,
      embeddingModel: 'text-embedding-3-small',     // optional, default
      assetBaseUrl: 'https://my-vendure.com/assets/', // for product image URLs
      corsOrigins: ['https://my-storefront.com'],     // allow direct frontend connections
    }),
  ],
};
```

### Key Dependencies

```json
{
  "peerDependencies": {
    "@vendure/core": ">=3.0.0"
  },
  "dependencies": {
    "ai": "^6.0.0",
    "@ai-sdk/openai": "^3.0.0",
    "zod": "^3.0.0"
  }
}
```

### What It Exposes

- `POST /ai-assistant/stream` — Vercel AI SDK UI message stream protocol (for `useChat()`)
- `POST /ai-assistant/chat` — Non-streaming JSON response (backward compatible)
- All 14 tools: searchProducts, vectorSearch, getCollections, filterByPrice, addToCart, getActiveOrder, adjustOrderLine, getOrderHistory, trackOrder, getAvailableCountries, getEligibleShippingMethods, setShippingAddress, setBillingAddress, setShippingMethod
- Embedding entities + services for vector search
- Configurable system prompt (future: allow users to extend/override)

### CORS Handling

The plugin should auto-register CORS middleware for the `/ai-assistant/*` routes based on the `corsOrigins` config option. This allows the frontend component to talk directly to Vendure without a proxy.

```ts
// Inside the plugin
if (options.corsOrigins?.length) {
  // Register CORS middleware for /ai-assistant/* routes
}
```

Alternatively, users configure CORS globally in Vendure's `apiOptions.cors`.

---

## Package 2: `@vendure/ai-chat-react` (Frontend)

### Structure

```
@vendure/ai-chat-react/
├── src/
│   ├── index.ts                        # public exports
│   ├── VendureAiChat.tsx               # main drop-in component
│   ├── hooks/
│   │   └── use-vendure-chat.ts         # headless hook (core logic)
│   ├── components/
│   │   ├── ChatPanel.tsx               # full chat panel
│   │   ├── ChatMessage.tsx             # single message bubble
│   │   ├── ChatInput.tsx               # input + send button
│   │   ├── ProductCard.tsx             # product result card
│   │   ├── CollectionBadge.tsx         # collection link
│   │   └── CartSummary.tsx             # active order widget
│   ├── utils/
│   │   └── extract-data.ts            # tool result → structured data extraction
│   ├── types.ts                        # ChatProduct, ChatCollection, etc.
│   └── styles/
│       └── vendure-chat.css            # default styles (CSS variables, no Tailwind)
├── package.json
├── tsconfig.json
└── README.md
```

### Approach: Two Levels of Usage

#### Level 1: Drop-in Component (Zero Config)

```tsx
import { VendureAiChat } from '@vendure/ai-chat-react';
import '@vendure/ai-chat-react/styles.css'; // optional default styles

function App() {
  return (
    <VendureAiChat vendureUrl="https://my-vendure.com" />
  );
}
```

This renders a floating chat button in the bottom-right corner that opens a chat panel. Works out of the box with no additional setup.

#### Level 2: Configurable Component

```tsx
<VendureAiChat
  // Connection
  vendureUrl="https://my-vendure.com"
  authToken={sessionToken}                // for logged-in user features

  // Appearance
  position="bottom-right"                 // "bottom-right" | "bottom-left" | "inline"
  theme="light"                           // "light" | "dark" | "auto"
  title="Shopping Assistant"
  placeholder="Ask about products..."
  welcomeMessage="Hi! How can I help you today?"
  quickActions={[
    'What do you sell?',
    'Show me your collections',
    'Help me find a gift',
  ]}

  // Callbacks — integrate with your app's cart/routing
  onAddToCart={(variantId, quantity, productName) => {
    // your cart logic (e.g. call your addToCart server action)
  }}
  onNavigate={(path) => {
    // your routing logic (e.g. router.push(path))
  }}

  // Custom rendering (override individual pieces)
  renderProduct={(product) => <MyCustomProductCard {...product} />}
  renderCollection={(collection) => <MyCustomBadge {...collection} />}
  renderCartSummary={(order) => <MyCartWidget {...order} />}

  // Styling
  className="my-custom-class"
/>
```

#### Level 3: Headless Hook (Full Control)

For users who want complete control over the UI:

```tsx
import { useVendureChat } from '@vendure/ai-chat-react';

function MyCustomChat() {
  const {
    // Chat state
    messages,           // UIMessage[] with parsed text + tool data
    status,             // 'ready' | 'streaming' | 'submitted'
    sendMessage,        // (text: string) => Promise<void>

    // Extracted structured data from the latest assistant response
    products,           // ChatProduct[] — products from tool results
    collections,        // ChatCollection[] — collections from tool results
    activeOrder,        // ChatActiveOrder | undefined — cart state
    addToCartAction,    // { variantId, quantity, productName } | undefined

    // Helpers
    getMessageText,     // (msg: UIMessage) => string
    getMessageData,     // (msg: UIMessage) => ExtractedData
  } = useVendureChat({
    vendureUrl: 'https://my-vendure.com',
    authToken: token,
  });

  // Build your own UI with complete freedom
  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>
          <p>{getMessageText(msg)}</p>
          {msg.role === 'assistant' && getMessageData(msg).products.map(p => (
            <div key={p.id}>{p.name} - ${p.price / 100}</div>
          ))}
        </div>
      ))}
      <input onKeyDown={e => e.key === 'Enter' && sendMessage(e.target.value)} />
    </div>
  );
}
```

### Styling: CSS Variables (No Tailwind Dependency)

The component ships with a default CSS file using CSS variables. Users can override the look without touching Tailwind:

```css
/* @vendure/ai-chat-react/styles.css — default theme */

:root {
  --vc-primary: #3b82f6;
  --vc-primary-foreground: #ffffff;
  --vc-background: #ffffff;
  --vc-foreground: #0f172a;
  --vc-muted: #f1f5f9;
  --vc-muted-foreground: #64748b;
  --vc-border: #e2e8f0;
  --vc-radius: 0.5rem;
  --vc-font-family: system-ui, -apple-system, sans-serif;
  --vc-font-size: 0.875rem;
  --vc-panel-width: 24rem;
  --vc-panel-height: 80vh;
  --vc-z-index: 9999;
}

/* Dark mode */
[data-theme="dark"], .dark {
  --vc-primary: #60a5fa;
  --vc-background: #0f172a;
  --vc-foreground: #f8fafc;
  --vc-muted: #1e293b;
  --vc-muted-foreground: #94a3b8;
  --vc-border: #334155;
}
```

Users override by setting CSS variables:

```css
:root {
  --vc-primary: #e11d48;       /* rose instead of blue */
  --vc-radius: 1rem;           /* rounder corners */
  --vc-panel-width: 28rem;     /* wider panel */
}
```

### Key Dependencies

```json
{
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18",
    "ai": "^6.0.0",
    "@ai-sdk/react": "^3.0.0"
  },
  "dependencies": {
    "react-markdown": "^9.0.0"
  }
}
```

No dependency on Next.js, Tailwind, shadcn/ui, or any routing library. The callbacks (`onNavigate`, `onAddToCart`) let users integrate with whatever framework they use.

### Direct Connection (No Proxy Required)

The hook internally creates a `DefaultChatTransport` pointing directly at the Vendure server:

```ts
// Inside use-vendure-chat.ts
const transport = useMemo(() => new DefaultChatTransport({
  api: `${vendureUrl}/ai-assistant/stream`,
  headers: authToken
    ? () => ({ Authorization: `Bearer ${authToken}` })
    : undefined,
}), [vendureUrl, authToken]);
```

This eliminates the need for a `/api/ai-assistant/chat` proxy route. The Vendure backend plugin handles CORS.

---

## Integration Examples

### Next.js App Router

```tsx
// app/layout.tsx
import { VendureAiChat } from '@vendure/ai-chat-react';
import '@vendure/ai-chat-react/styles.css';
import { getAuthToken } from '@/lib/auth';

export default async function Layout({ children }) {
  const token = await getAuthToken();
  return (
    <html>
      <body>
        {children}
        <VendureAiChat
          vendureUrl={process.env.NEXT_PUBLIC_VENDURE_URL}
          authToken={token}
          onAddToCart={async (variantId, qty) => {
            'use server';
            await addItemToOrder(variantId, qty);
          }}
        />
      </body>
    </html>
  );
}
```

### Remix

```tsx
// app/root.tsx
import { VendureAiChat } from '@vendure/ai-chat-react';
import styles from '@vendure/ai-chat-react/styles.css?url';

export const links = () => [{ rel: 'stylesheet', href: styles }];

export default function App() {
  const { token } = useLoaderData();
  return (
    <html>
      <body>
        <Outlet />
        <VendureAiChat
          vendureUrl="https://my-vendure.com"
          authToken={token}
          onNavigate={(path) => navigate(path)}
        />
      </body>
    </html>
  );
}
```

### Plain Vite React

```tsx
// main.tsx
import { VendureAiChat } from '@vendure/ai-chat-react';
import '@vendure/ai-chat-react/styles.css';

function App() {
  return (
    <div>
      <h1>My Store</h1>
      <VendureAiChat vendureUrl="https://my-vendure.com" />
    </div>
  );
}
```

---

## Implementation Steps

### Phase 1: Extract & Package Backend Plugin
1. Move `apps/server/src/plugins/ai-assistant-plugin/` into a standalone package
2. Add proper `package.json` with peer deps on `@vendure/core`
3. Add `tsconfig.json` for building to ESM + CJS
4. Add CORS configuration option
5. Test as an installed npm package in a fresh Vendure project
6. Publish to npm

### Phase 2: Build Frontend React Package
1. Create new package with the structure above
2. Extract and refactor `chat-panel.tsx` into composable pieces
3. Replace Tailwind classes with CSS variable-based styles
4. Replace shadcn/ui components with self-contained equivalents (or minimal wrappers)
5. Build the `useVendureChat()` headless hook
6. Build the `<VendureAiChat />` drop-in component with all props
7. Remove dependencies on Next.js (`next/image`, `next/link`, `next/navigation`)
   - Use `<img>` instead of `next/image`
   - Use `<a>` + `onNavigate` callback instead of `next/link`
8. Bundle with Rollup/tsup for ESM + CJS output
9. Test in Next.js, Remix, and plain Vite React apps
10. Publish to npm

### Phase 3: Documentation & Examples
1. Write README with quick start, API reference, and customization guide
2. Create example apps for Next.js, Remix, and Vite
3. Add Storybook for component development/preview
4. Add integration tests

---

## Chat Message Persistence

### Current Behavior

Messages are stored in **React in-memory state** only (`useChat()` hook state). There is no persistence layer.

- **Survives** client-side navigations (Next.js `<Link>`, `router.push()`) — because the chat component lives in the layout which stays mounted during soft navigations.
- **Lost on** hard navigations (server-side `redirect()`, `window.location.href`, full page reload, tab close) — React state is destroyed when components unmount.
- **Example:** Clicking "Place Order" in checkout triggers `redirect('/order-confirmation/...')` from a server action, which is a hard navigation that kills all client state including chat history.

### Persistence Approaches

#### Option A: `sessionStorage` (Recommended for MVP)

Persist messages to `sessionStorage` so they survive hard navigations within the same browser tab. Lost when the tab is closed.

```ts
// In useVendureChat hook
const STORAGE_KEY = 'vendure-ai-chat-messages';

// On message change → save
useEffect(() => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}, [messages]);

// On mount → restore
const initialMessages = useMemo(() => {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}, []);
```

**Pros:** Simple, no server infrastructure, messages survive redirects and full reloads.
**Cons:** Lost on tab close. Storage limit (~5MB). No cross-tab sync.

The `@ai-sdk/react` `useChat` hook accepts an `initialMessages` option (via `ChatInit.messages`) that can be populated from storage on mount.

#### Option B: `localStorage` with TTL

Same as sessionStorage but persists across tabs and browser restarts. Needs a TTL to avoid stale conversations:

```ts
const STORAGE_KEY = 'vendure-ai-chat-messages';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function saveMessages(messages: UIMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    messages,
    timestamp: Date.now(),
  }));
}

function loadMessages(): UIMessage[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const { messages, timestamp } = JSON.parse(raw);
  if (Date.now() - timestamp > TTL_MS) {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
  return messages;
}
```

**Pros:** Persists across tabs and browser restarts. Familiar UX (chat picks up where you left off).
**Cons:** Stale data risk (mitigated by TTL). Storage limit (~5MB). Privacy concern — chat history on shared computers.

#### Option C: Server-Side Persistence (Full Solution)

Store conversations in the database, linked to the customer's account. The backend plugin manages conversation CRUD.

```
New endpoints:
  GET  /ai-assistant/conversations           → list conversations for customer
  GET  /ai-assistant/conversations/:id       → load a conversation
  POST /ai-assistant/conversations/:id/chat  → send message (stream response + auto-save)
  DELETE /ai-assistant/conversations/:id     → delete conversation

New entity:
  AiConversation { id, customerId, messages (JSON), createdAt, updatedAt }
```

Frontend passes a `conversationId` to the hook. On load, fetches existing messages from the backend. On each response, the backend auto-saves.

```tsx
<VendureAiChat
  vendureUrl="https://my-vendure.com"
  authToken={token}
  persistence="server"  // enables server-side persistence
/>
```

**Pros:** True persistence across devices. Admin can view conversations for support/analytics. No storage limits.
**Cons:** Significant backend work. Requires authentication (no anonymous chat persistence). Database storage growth. Privacy/GDPR implications.

#### Option D: Hybrid (Recommended for Production)

- **Anonymous users:** `sessionStorage` (Option A) — lightweight, no server overhead.
- **Logged-in users:** Server-side persistence (Option C) — chat history tied to their account, survives across devices.

```tsx
<VendureAiChat
  vendureUrl="https://my-vendure.com"
  authToken={token}
  persistence={token ? "server" : "session"}
/>
```

### Recommendation

For the distributable package:
1. **Ship with `sessionStorage` by default** — zero config, works everywhere, solves the "chat disappears on redirect" problem.
2. **Add a `persistence` prop** — `"none"` (current), `"session"` (sessionStorage), `"local"` (localStorage with TTL), or `"server"` (backend API).
3. **Server persistence as a plugin add-on** — additional entity + endpoints in the backend plugin, opt-in.

---

## Open Questions

- **Package naming:** `@vendure/ai-chat-plugin` + `@vendure/ai-chat-react`, or `vendure-ai-chat` + `vendure-ai-chat-react` (if not publishing under `@vendure` scope)?
- **LLM provider lock-in:** Currently hardcoded to OpenAI via `@ai-sdk/openai`. Should the plugin accept any Vercel AI SDK provider (Anthropic, Google, etc.)? The `ai` package supports this — the plugin could accept a `model` option instead of just `openaiApiKey`.
- **Embedding provider:** Same question for embeddings. Could allow pluggable embedding providers.
- **System prompt customization:** Allow users to extend/override the system prompt? e.g. `systemPromptSuffix: "Our store specializes in organic products..."`.
- **Tool extensibility:** Allow users to register custom tools? e.g. a "check store hours" tool for their specific business.
