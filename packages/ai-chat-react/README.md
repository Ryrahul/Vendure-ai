# @rahul_vendure/ai-chat-react

Drop-in AI shopping assistant React component for [Vendure](https://www.vendure.io/) stores. Renders a floating chat panel with product cards, collection badges, cart summary, and quick actions — all powered by the [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) backend.

Ships a pre-compiled CSS file — just import and go. Works with any React framework (Next.js, Remix, Vite, CRA, etc.).

## Features

- **Drop-in Component** — `<VendureAiChat>` renders a floating chat button + panel, zero config
- **Headless Hook** — `useVendureChat()` for full UI control
- **Product Cards** — Automatic product display with images, prices, and add-to-cart buttons
- **Collection Badges** — Clickable collection/category links
- **Cart Summary** — Shows active order with line items and totals
- **Zero Config Styles** — Ships pre-compiled CSS, just import and go. Inherits your theme via CSS variables
- **Dark Mode** — Works with Tailwind's dark mode out of the box
- **Framework Agnostic** — Works with Next.js, Remix, Vite, CRA, etc.
- **Streaming** — Real-time response streaming via Vercel AI SDK
- **Guest carts** — with the shopper's session token the assistant sees and changes the same cart as your storefront, for guests and customers alike
- **Store currency** — prices show in the channel's currency (`NPR 99.00`, `£11.88`), multi-channel via `channelToken`
- **Any model** — works with whatever the server runs: OpenAI, Azure OpenAI, Anthropic, self-hosted models…
- **lucide-react Icons** — Clean, consistent icons throughout

## Requirements

- React `>=18`
- `ai` 6 and `@ai-sdk/react` 3 (peer dependencies — the same major versions as the server's stream protocol)
- A Vendure server with [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) — `>=0.5.0` recommended (it is required with Azure OpenAI)

## Installation

```bash
npm install @rahul_vendure/ai-chat-react ai@^6 @ai-sdk/react@^3
```

## Quick Start

```tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';
import '@rahul_vendure/ai-chat-react/styles.css';

function App() {
    return (
        <div>
            <h1>My Store</h1>
            <VendureAiChat vendureUrl="https://my-vendure.com" />
        </div>
    );
}
```

This renders a floating chat button in the bottom-right corner. Click to open the chat panel.

> **Note:** The component uses CSS variables like `--primary`, `--foreground`, `--muted`, etc., following the standard [shadcn/ui convention](https://ui.shadcn.com/docs/theming). If you're using shadcn/ui, it works out of the box. Otherwise, define these CSS variables in your globals (see [Theming](#theming) below).

## Usage Levels

### Level 1: Drop-in (Zero Config)

```tsx
<VendureAiChat vendureUrl="https://my-vendure.com" />
```

### Level 1 with auth, callbacks, and formatting

Same component with auth token, price formatting, add-to-cart, cart refresh, and navigation — typical for a storefront navbar or layout:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';
import '@rahul_vendure/ai-chat-react/styles.css';
import { formatPrice } from '@/lib/format';

export function NavbarChat({ vendureUrl, authToken }: { vendureUrl: string; authToken?: string }) {
    const router = useRouter();

    return (
        <VendureAiChat
            vendureUrl={vendureUrl}
            authToken={authToken}
            formatPrice={formatPrice}
            position="bottom-right"
            onCartUpdate={() => router.refresh()}
            onAddToCart={async (variantId, quantity, productName) => {
                const { addToCart } = await import('@/app/product/[slug]/actions');
                const result = await addToCart(variantId, quantity);
                if (result.success) {
                    toast.success('Added to cart', {
                        description: `${productName} has been added to your cart`,
                    });
                    router.refresh();
                } else {
                    toast.error('Error', {
                        description: result.error || 'Failed to add item to cart',
                    });
                }
            }}
            onNavigate={(path) => router.push(path)}
        />
    );
}
```

Get `authToken` from your server (e.g. via a wrapper like `NavbarChatWithAuth`) — see [Authentication](#authentication).

**`formatPrice`** — Prices from the chat API are in **cents** (smallest currency unit). Provide a function `(price: number) => string`:

```ts
// lib/format.ts — example: USD with Intl
export function formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(price / 100);
}

// Or minimal: "$12.34"
export function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}
```

### Level 2: All config options

You can configure appearance, callbacks, and custom renderers. Full list of props:

```tsx
<VendureAiChat
    // Connection
    vendureUrl="https://my-vendure.com"
    authToken={sessionToken}

    // Appearance
    position="bottom-right"          // "bottom-right" | "bottom-left" | "inline"
    title="Shopping Assistant"
    placeholder="Ask about products..."
    welcomeMessage="Hi! How can I help you today?"
    quickActions={[
        'What do you sell?',
        'Show me your collections',
        'Help me find a gift',
    ]}

    // Callbacks
    onAddToCart={async (variantId, quantity, productName) => {
        await addToCart(variantId, quantity);
        toast.success(`Added ${productName} to cart`);
    }}
    onCartUpdate={() => router.refresh()}
    onNavigate={(path) => router.push(path)}

    // Custom rendering
    renderProduct={(product) => <MyProductCard {...product} />}
    renderCollection={(collection) => <MyBadge {...collection} />}
    renderCartSummary={(order) => <MyCartWidget {...order} />}

    // Formatting
    formatPrice={(price) => `$${(price / 100).toFixed(2)}`}

    // Styling
    className="my-custom-class"
/>
```

See [Props Reference](#props-reference) for types and defaults.

### Level 3: Headless Hook (Full Control)

```tsx
import { useVendureChat } from '@rahul_vendure/ai-chat-react';

function MyCustomChat() {
    const {
        messages,
        status,
        sendMessage,
        isLoading,
        products,
        collections,
        activeOrder,
        getMessageText,
        getMessageData,
    } = useVendureChat({
        vendureUrl: 'https://my-vendure.com',
        authToken: token,
    });

    return (
        <div>
            {messages.map(msg => (
                <div key={msg.id}>
                    <p>{getMessageText(msg)}</p>
                    {msg.role === 'assistant' && getMessageData(msg).products.map(p => (
                        <div key={p.id}>{p.name} — {p.price}</div>
                    ))}
                </div>
            ))}
            <input onKeyDown={e => {
                if (e.key === 'Enter') sendMessage(e.currentTarget.value);
            }} />
        </div>
    );
}
```

## Props Reference

### `<VendureAiChat>` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `vendureUrl` | `string` | *required* | Vendure server URL |
| `authToken` | `string` | — | The shopper's Vendure Shop API session token — logged-in customers **and guests** (needed for cart and checkout) |
| `channelToken` | `string` | — | Your storefront channel's token, sent as `vendure-token`. Required for any channel other than the default one, otherwise the assistant searches, prices and shops in the default channel |
| `position` | `'bottom-right' \| 'bottom-left' \| 'inline'` | `'bottom-right'` | Chat position |
| `title` | `string` | `'Shopping Assistant'` | Header title |
| `placeholder` | `string` | `'Ask about products...'` | Input placeholder |
| `welcomeMessage` | `string` | Default greeting | Empty state message |
| `quickActions` | `string[]` | Default actions | Quick action buttons |
| `onAddToCart` | `(variantId, quantity, name) => void` | — | Cart callback |
| `onNavigate` | `(path) => void` | — | Navigation callback |
| `renderProduct` | `(product) => ReactNode` | — | Custom product renderer |
| `renderCollection` | `(collection) => ReactNode` | — | Custom collection renderer |
| `renderCartSummary` | `(order) => ReactNode` | — | Custom cart renderer |
| `formatPrice` | `(price, currencyCode?) => string` | `formatChatPrice` — localized, in the store currency (e.g. `NPR 99.00`, `£11.88`) | Price formatter. Prices are in the smallest currency unit; `currencyCode` comes from the plugin (`>= 0.4.1` for carts and orders) |
| `className` | `string` | — | Additional CSS class |

### `useVendureChat()` Return

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `UIMessage[]` | All chat messages |
| `status` | `string` | `'ready' \| 'streaming' \| 'submitted' \| 'error'` |
| `sendMessage` | `(text: string) => Promise<void>` | Send a message |
| `isLoading` | `boolean` | Whether chat is loading/streaming |
| `products` | `ChatProduct[]` | Products from latest response |
| `collections` | `ChatCollection[]` | Collections from latest response |
| `activeOrder` | `ChatActiveOrder \| undefined` | Cart state from latest response |
| `getMessageText` | `(msg) => string` | Extract text from a message |
| `getMessageData` | `(msg) => ExtractedData` | Extract structured data from a message |

## Theming

The component uses Tailwind utility classes that reference CSS variables following the [shadcn/ui convention](https://ui.shadcn.com/docs/theming):

- `bg-primary`, `text-primary-foreground` — primary button/accent color
- `bg-muted`, `text-muted-foreground` — assistant message bubbles, secondary UI
- `bg-background`, `text-foreground` — main background and text
- `border` — borders using `border-border`

**If you use shadcn/ui**, everything works out of the box — the component inherits your theme.

**If you don't use shadcn/ui**, add these CSS variables to your globals:

```css
@layer base {
    :root {
        --background: 0 0% 100%;
        --foreground: 222.2 84% 4.9%;
        --primary: 221.2 83.2% 53.3%;
        --primary-foreground: 210 40% 98%;
        --muted: 210 40% 96.1%;
        --muted-foreground: 215.4 16.3% 46.9%;
        --border: 214.3 31.8% 91.4%;
        --input: 214.3 31.8% 91.4%;
        --ring: 221.2 83.2% 53.3%;
    }

    .dark {
        --background: 222.2 84% 4.9%;
        --foreground: 210 40% 98%;
        --primary: 217.2 91.2% 59.8%;
        --primary-foreground: 222.2 84% 4.9%;
        --muted: 217.2 32.6% 17.5%;
        --muted-foreground: 215 20.2% 65.1%;
        --border: 217.2 32.6% 17.5%;
        --input: 217.2 32.6% 17.5%;
        --ring: 224.3 76.3% 48%;
    }
}
```

You can customize the component's look by changing these CSS variables in your Tailwind config.

## Authentication

> **Conversations are private.** Each visitor gets a random conversation id on their first message, and the server stores history per customer or session, so two shoppers never share a conversation (fixed in 0.2.0 — earlier versions shared one).


The `authToken` prop is **optional**. Without it, the chat can search products, browse collections and filter by price.

Pass the shopper's Vendure Shop API session token — **for guests too** (with plugin `>= 0.4.0`). A guest's cart lives on their session, so with the same token the assistant can view and change the guest's cart and help with checkout. Order history and tracking need a logged-in customer:

| Feature | Anonymous | Authenticated |
|---------|-----------|---------------|
| Product search | Yes | Yes |
| Vector/semantic search | Yes | Yes |
| Browse collections | Yes | Yes |
| Filter by price | Yes | Yes |
| Add to cart | Yes (with the guest's session token) | Yes |
| View / change cart | Yes (with the guest's session token) | Yes |
| Order history | No | Yes |
| Track orders | No | Yes |
| Checkout flow | Yes (with the guest's session token) | Yes |

### How it works

When a customer logs in to your Vendure storefront — or a guest adds their first item — Vendure returns a session token. You store this token (typically in an HTTP-only cookie), then pass it to `<VendureAiChat>` as the `authToken` prop. The component sends it as an `Authorization: Bearer <token>` header with every chat request, and the backend resolves the session to enable cart and customer tools.

Keep the prop current: when your storefront gets a new token (first add-to-cart, login, logout), re-render with it — e.g. `router.refresh()` in Next.js. Since 0.2.4 the next message uses the new token (earlier versions kept the first one, so the assistant could report an empty cart after the storefront had created one).

### Next.js App Router (recommended pattern)

The token must flow from a **server component** (which can read cookies) to the **client component** (which renders the chat). Here's the full pattern:

**1. Auth helper** — read/write the Vendure session token from cookies:

```ts
// lib/auth.ts
import { cookies } from 'next/headers';

const AUTH_TOKEN_COOKIE = 'vendure-auth-token';

export async function getAuthToken(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
}

export async function setAuthToken(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_TOKEN_COOKIE, token);
}
```

> Set this cookie when the customer logs in (e.g. after calling the `login` mutation on the Vendure Shop API, store the returned token with `setAuthToken(token)`).

**2. Client component** — wraps `<VendureAiChat>` (must be a client component since it uses hooks):

```tsx
// components/storefront-chat.tsx
'use client';
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

interface StorefrontChatProps {
    vendureUrl: string;
    authToken?: string;
}

export function StorefrontChat({ vendureUrl, authToken }: StorefrontChatProps) {
    return (
        <VendureAiChat
            vendureUrl={vendureUrl}
            authToken={authToken}
            onNavigate={(path) => { window.location.href = path; }}
        />
    );
}
```

**3. Server component** — reads the token from cookies and passes it down:

```tsx
// app/layout.tsx (or any server component like a Navbar)
import { getAuthToken } from '@/lib/auth';
import { StorefrontChat } from '@/components/storefront-chat';

const VENDURE_URL = process.env.VENDURE_SHOP_API_URL!.replace(/\/shop-api\/?$/, '');

export default async function Layout({ children }) {
    const authToken = await getAuthToken();

    return (
        <html>
            <body>
                {children}
                <StorefrontChat vendureUrl={VENDURE_URL} authToken={authToken} />
            </body>
        </html>
    );
}
```

This pattern ensures the token is read server-side (secure, no exposure to client JS) and passed as a prop to the chat component. If the chat lives in a child (e.g. Navbar) that is not async, use the [wrapper pattern below](#chat-in-navbar-or-other-non-async-parent).

#### Chat in Navbar (or other non-async parent)

If the component that should render the chat (e.g. your Navbar) is **not** an async server component, use a small **async wrapper** that fetches the token and renders the client chat. Wrap the wrapper in `<Suspense>` to avoid errors.

**1. Auth helper** — same as above, e.g. in `lib/auth.ts`:

```ts
// lib/auth.ts
import { cookies } from 'next/headers';

const AUTH_TOKEN_COOKIE = process.env.VENDURE_AUTH_TOKEN_COOKIE || 'vendure-auth-token';

export async function getAuthToken(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
}
```

**2. Async server wrapper** — fetches the token and passes it to the client chat:

```tsx
// components/layout/navbar/navbar-chat-with-auth.tsx
import { getAuthToken } from '@/lib/auth';
import { NavbarChat } from './navbar-chat';

interface NavbarChatWithAuthProps {
    vendureUrl: string;
}

export async function NavbarChatWithAuth({ vendureUrl }: NavbarChatWithAuthProps) {
    const authToken = await getAuthToken();
    return <NavbarChat vendureUrl={vendureUrl} authToken={authToken} />;
}
```

**3. Client component** — wraps `<VendureAiChat>` with your callbacks (e.g. add-to-cart, navigation, formatting):

```tsx
// components/layout/navbar/navbar-chat.tsx
'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';
import { formatPrice } from '@/lib/format';

interface NavbarChatProps {
    vendureUrl: string;
    authToken?: string;
}

export function NavbarChat({ vendureUrl, authToken }: NavbarChatProps) {
    const router = useRouter();

    return (
        <VendureAiChat
            vendureUrl={vendureUrl}
            authToken={authToken}
            formatPrice={formatPrice}
            position="bottom-right"
            onCartUpdate={() => router.refresh()}
            onAddToCart={async (variantId, quantity, productName) => {
                const { addToCart } = await import('@/app/product/[slug]/actions');
                const result = await addToCart(variantId, quantity);
                if (result.success) {
                    toast.success('Added to cart', {
                        description: `${productName} has been added to your cart`,
                    });
                    router.refresh();
                } else {
                    toast.error('Error', {
                        description: result.error || 'Failed to add item to cart',
                    });
                }
            }}
            onNavigate={(path) => router.push(path)}
        />
    );
}
```

**4. Use the wrapper in your Navbar** — keep the Navbar as a regular (sync) component and wrap the chat in `Suspense`:

```tsx
// components/layout/navbar.tsx
import { NavbarChatWithAuth } from '@/components/layout/navbar/navbar-chat-with-auth';
import { Suspense } from 'react';


export function Navbar() {
    return (
        <header>
            {/* ... other navbar content ... */}
            <Suspense>
                <NavbarChatWithAuth vendureUrl={VENDURE_BASE_URL} />
            </Suspense>
        </header>
    );
}
```

Using the async wrapper + `Suspense` keeps the token on the server and avoids making the whole Navbar async.

### Remix

```tsx
// app/root.tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';
import { useLoaderData, useNavigate } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
    const cookie = request.headers.get('Cookie') ?? '';
    const authToken = cookie.match(/vendure-auth-token=([^;]+)/)?.[1];
    return { authToken };
}

export default function App() {
    const { authToken } = useLoaderData<typeof loader>();
    const navigate = useNavigate();

    return (
        <html>
            <body>
                <Outlet />
                <VendureAiChat
                    vendureUrl="https://my-vendure.com"
                    authToken={authToken}
                    onNavigate={(path) => navigate(path)}
                />
            </body>
        </html>
    );
}
```

### Plain Vite / CRA (client-side only)

If you don't have a server component layer, read the token from wherever you store it (localStorage, cookie, auth context):

```tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

function App() {
    // Read from wherever your app stores the Vendure session token
    const authToken = localStorage.getItem('vendure-auth-token') ?? undefined;

    return (
        <div>
            <h1>My Store</h1>
            <VendureAiChat vendureUrl="https://my-vendure.com" authToken={authToken} />
        </div>
    );
}
```

### Inline Mode

Embed the chat panel inside your layout (no floating button):

```tsx
<div style={{ height: '600px', width: '400px' }}>
    <VendureAiChat vendureUrl="https://my-vendure.com" position="inline" />
</div>
```

## Exports

```ts
// Main component
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

// Headless hook
import { useVendureChat } from '@rahul_vendure/ai-chat-react';

// Sub-components (for advanced customization)
import { ChatMessage, ProductCard, CollectionBadge, CartSummary } from '@rahul_vendure/ai-chat-react';

// Utilities
import { extractDataFromMessage, getMessageText, cn, formatChatPrice } from '@rahul_vendure/ai-chat-react';

// Types
import type { ChatProduct, ChatCollection, ChatActiveOrder, ExtractedData } from '@rahul_vendure/ai-chat-react';
```

## CSS Setup

The package ships a pre-compiled CSS file with all the styles the component needs. Import it once in your app:

```tsx
import '@rahul_vendure/ai-chat-react/styles.css';
```

That's it — no Tailwind `@source` directives or `content` config needed.

The CSS uses CSS variables for theming (see [Theming](#theming)), so it inherits your existing theme if you use shadcn/ui. It does **not** include a CSS reset/preflight, so it won't conflict with your existing styles.

> **Troubleshooting:** If the chat button appears inline in your navbar instead of floating in the corner, make sure you've imported the CSS file.

## CORS

The component connects directly to your Vendure server (no proxy needed). Make sure CORS is configured on the backend:

```ts
// vendure-config.ts
export const config: VendureConfig = {
    apiOptions: {
        cors: {
            origin: ['https://my-storefront.com'],
        },
    },
};
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| The chat shows your message but no reply | Install `ai@^6` and `@ai-sdk/react@^3` (not 7 / 4), update the server plugin to `>=0.5.0`, and allow your storefront origin in CORS |
| The assistant says the cart is empty after adding an item | Pass the storefront's current session token as `authToken` (widget `>=0.2.4`) and refresh it after the first add-to-cart |
| Prices show in `$` | Don't pass a `formatPrice` that hard-codes USD — the default `formatChatPrice` uses the store currency; custom formatters receive `(price, currencyCode)` |
| Wrong channel's products or prices | Pass `channelToken` for non-default channels |
| The chat button sits inline instead of floating | Import `@rahul_vendure/ai-chat-react/styles.css` |
| Product images missing | Set `assetBaseUrl` in the server plugin |

## License

AGPL-3.0 — see [LICENSE](./LICENSE) for details.
