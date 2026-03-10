# @rahul_vendure/ai-chat-dashboard

AI chat assistant widget for the [Vendure](https://www.vendure.io/) admin dashboard. Adds an "AI Chat" page to the React-based Vendure 3.x dashboard where store admins can query products, orders, customers, and collections using natural language.

## Features

- **Dashboard Extension** — Adds an "AI Chat" page under its own "AI" section in the sidebar
- **Product Cards** — Search results render as visual cards with images, prices — click to open in the catalog
- **Order Cards** — Orders render with status badges, line items with thumbnails — click to open order detail
- **Semantic Search** — "products for developers", "gaming gear" — uses pgvector embeddings
- **Customer Lookup** — Search customers by name or email with order stats
- **Collection Browser** — List and search product categories
- **Markdown Rendering** — AI responses rendered with `react-markdown` + GitHub-flavored tables
- **Multi-turn Conversations** — Conversation history maintained across messages
- **Dashboard Theme** — Uses Vendure dashboard CSS variables, matches light/dark theme

## Requirements

- Vendure `>=3.0.0` with the React-based `@vendure/dashboard` (`>=3.5.0`)
- [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) — provides the backend AI service and REST endpoint
- `DashboardPlugin` must be configured in your Vendure config

## Installation

```bash
npm install @rahul_vendure/ai-chat-plugin @rahul_vendure/ai-chat-dashboard
```

## Setup

Add both plugins to your Vendure config:

```ts
import { AiAssistantPlugin } from '@rahul_vendure/ai-chat-plugin';
import { AiChatDashboardPlugin } from '@rahul_vendure/ai-chat-dashboard';
import { DashboardPlugin } from '@vendure/dashboard/plugin';

export const config: VendureConfig = {
    plugins: [
        AiAssistantPlugin.init({
            openaiApiKey: process.env.OPENAI_API_KEY!,
        }),
        AiChatDashboardPlugin,
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: path.join(__dirname, '../dist/dashboard'),
        }),
    ],
};
```

### Workspace / Monorepo Setup

If you're using npm workspaces (the plugin is symlinked), Vendure's built-in dashboard extension scanner may not detect symlinked packages. Add this workaround to your `vite.config.mts`:

```ts
import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { readdirSync, existsSync, lstatSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig, Plugin } from 'vite';

function workspaceDashboardExtensions(): Plugin {
    const resolvedId = `\0virtual:dashboard-extensions`;
    const packagesDir = resolve(__dirname, '../../packages');

    function discoverDashboardExtensions(): string[] {
        const extensions: string[] = [];
        if (!existsSync(packagesDir)) return extensions;
        for (const entry of readdirSync(packagesDir)) {
            const pkgDir = join(packagesDir, entry);
            try { if (!lstatSync(pkgDir).isDirectory()) continue; } catch { continue; }
            const dashboardEntry = join(pkgDir, 'src/dashboard/index.tsx');
            if (existsSync(dashboardEntry)) extensions.push(dashboardEntry);
        }
        return extensions;
    }

    return {
        name: 'vendure:workspace-dashboard-extensions',
        enforce: 'post',
        transform(code, id) {
            if (id === resolvedId) {
                const extensions = discoverDashboardExtensions();
                const imports = extensions
                    .map(ext => `await import('${pathToFileURL(ext).href}');`)
                    .join('\n    ');
                return {
                    code: `export async function runDashboardExtensions() {\n    ${imports}\n}`,
                    map: null,
                };
            }
        },
    };
}

export default defineConfig({
    plugins: [
        vendureDashboardPlugin({ /* ... */ }),
        workspaceDashboardExtensions(),
    ],
});
```

## What It Looks Like

After setup, you'll see an **AI** section in the dashboard sidebar with an **AI Chat** page. The chat supports:

- **Product search** — "do we have laptops?" → product cards with images
- **Semantic search** — "products for developers" → vector search results
- **Order lookup** — "show orders by john" → order cards with status badges
- **Customer search** — "find customers named rahul" → customer details with order stats
- **Collection browser** — "list collections" → formatted table

Product cards link to `/dashboard/products/{id}` and order cards link to `/dashboard/orders/{id}`.

## Architecture

This is a **dashboard-only** package — it contains no backend logic. The architecture is:

| Package | Role |
|---------|------|
| `@rahul_vendure/ai-chat-plugin` | Backend: AI service, tools, REST endpoint at `/admin-ai-chat/chat` |
| `@rahul_vendure/ai-chat-dashboard` | Frontend: Dashboard extension with chat UI, product/order cards |

## License


AGPL-3.0 — see [LICENSE](./LICENSE) for details.
