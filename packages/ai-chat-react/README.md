# @rahul_vendure/ai-chat-react

Drop-in AI shopping assistant React component for [Vendure](https://www.vendure.io/) stores. Renders a floating chat panel with product cards, collection badges, cart summary, and quick actions — all powered by the [`@rahul_vendure/ai-chat-plugin`](../ai-chat-plugin) backend.

Styled with **Tailwind CSS** utility classes. Works with any React framework (Next.js, Remix, Vite, CRA, etc.).

## Features

- **Drop-in Component** — `<VendureAiChat>` renders a floating chat button + panel, zero config
- **Headless Hook** — `useVendureChat()` for full UI control
- **Product Cards** — Automatic product display with images, prices, and add-to-cart buttons
- **Collection Badges** — Clickable collection/category links
- **Cart Summary** — Shows active order with line items and totals
- **Tailwind CSS** — Styled with utility classes, inherits your Tailwind theme (colors, radius, fonts)
- **Dark Mode** — Works with Tailwind's dark mode out of the box
- **Framework Agnostic** — Works with Next.js, Remix, Vite, CRA, etc.
- **Streaming** — Real-time response streaming via Vercel AI SDK
- **lucide-react Icons** — Clean, consistent icons throughout

## Requirements

- React `>=18`
- Tailwind CSS `>=3.0` (the component uses Tailwind utility classes)
- A Vendure server with [`@rahul_vendure/ai-chat-plugin`](../ai-chat-plugin) installed

## Installation

```bash
npm install @rahul_vendure/ai-chat-react ai @ai-sdk/react
```

## Quick Start

```tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

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

> **Note:** The component uses Tailwind utility classes like `bg-primary`, `text-foreground`, `bg-muted`, etc. These map to the standard shadcn/ui CSS variable convention. If you're using shadcn/ui, it works out of the box. Otherwise, define these CSS variables in your globals (see [Theming](#theming) below).

## Usage Levels

### Level 1: Drop-in (Zero Config)

```tsx
<VendureAiChat vendureUrl="https://my-vendure.com" />
```

### Level 2: Configurable

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
| `authToken` | `string` | — | Bearer token for authenticated features |
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
| `formatPrice` | `(price) => string` | `$X.XX` | Price formatter |
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

## Framework Examples

### Next.js App Router

```tsx
// app/layout.tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

export default function Layout({ children }) {
    return (
        <html>
            <body>
                {children}
                <VendureAiChat
                    vendureUrl={process.env.NEXT_PUBLIC_VENDURE_URL!}
                    onNavigate={(path) => { window.location.href = path; }}
                />
            </body>
        </html>
    );
}
```

### Remix

```tsx
// app/root.tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

export default function App() {
    const navigate = useNavigate();
    return (
        <html>
            <body>
                <Outlet />
                <VendureAiChat
                    vendureUrl="https://my-vendure.com"
                    onNavigate={(path) => navigate(path)}
                />
            </body>
        </html>
    );
}
```

### Plain Vite React

```tsx
import { VendureAiChat } from '@rahul_vendure/ai-chat-react';

function App() {
    return (
        <div>
            <h1>My Store</h1>
            <VendureAiChat vendureUrl="https://my-vendure.com" />
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
import { extractDataFromMessage, getMessageText, cn } from '@rahul_vendure/ai-chat-react';

// Types
import type { ChatProduct, ChatCollection, ChatActiveOrder, ExtractedData } from '@rahul_vendure/ai-chat-react';
```

## Tailwind Content Config

Make sure the package is included in your Tailwind content paths so the utility classes aren't purged:

```js
// tailwind.config.js
module.exports = {
    content: [
        './src/**/*.{js,ts,jsx,tsx}',
        './node_modules/@rahul_vendure/ai-chat-react/dist/**/*.{js,mjs}',
    ],
};
```

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

## License

MIT
