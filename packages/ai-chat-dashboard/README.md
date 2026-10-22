# @rahul_vendure/ai-chat-dashboard

AI assistant for the React-based [Vendure](https://www.vendure.io/) 3.x admin dashboard. Store admins chat in plain language to find and change products, orders, customers, promotions and settings — and to get a business analyst's view of the store: sales, a 30-day forecast, what to reorder and how their prices compare with competitors, as charts and tables right in the chat.

This package is the UI. The assistant itself runs on your server in [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) (OpenAI, Azure OpenAI or any AI SDK model).

## Features

- **AI Chat page** — its own **AI** section in the sidebar, with a list of your past conversations (private to each administrator).
- **Quick chat in the toolbar** — a sparkle button next to the alerts bell opens a compact chat on any page; "Open full view" switches to the AI Chat page.
- **Works in the active channel** — follows the dashboard's channel switcher; the assistant only sees and changes what your role allows in that channel.
- **Product and order cards** — results render with images, prices and status badges; click to open them in the dashboard.
- **Confirm before destructive actions** — deletes and changes to staff, roles, channels, settings or payment methods appear as a Confirm / Cancel card; nothing runs until you press Confirm.
- **Business insight cards** (plugin ≥ 0.5.0):
  - *Sales summary* — revenue, orders, average order value and units vs the previous period
  - *Sales trend* — revenue per day, week or month
  - *30-day forecast* — history, dashed forecast and the shaded likely range, with expected revenue and orders and the forecast's measured accuracy
  - *Inventory plan* — stock, sales per day, days left, run-out date, status (reorder now / soon / OK / overstock) and order quantity
  - *Top products* and *customer locations* (cities, regions, countries)
  - *Web sources* — the pages competitor research is based on
- **Progress while it works** — longer answers (web research, forecasts) show elapsed time and what's happening instead of only dots.
- **Embed all** — a button on **Settings → Global settings** re-embeds the catalog for semantic search.
- **Theme-aware** — uses the dashboard's CSS variables, so it matches light and dark mode. Charts use `recharts`, which the dashboard already ships.

## Requirements

- Vendure `>=3.0.0` with the React dashboard (`@vendure/dashboard` `>=3.5.0`) and `DashboardPlugin` configured
- [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) — `>=0.5.1` recommended (business insights need `>=0.5.0`)
- Administrators need the **`UseAiAdminAssistant`** permission (SuperAdmins have it) plus the usual permission for each action

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
            openaiApiKey: process.env.OPENAI_API_KEY!, // or Azure / any AI SDK model — see the plugin README
        }),
        AiChatDashboardPlugin,
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: path.join(__dirname, '../dist/dashboard'),
        }),
    ],
};
```

Add this to your dashboard's `vite.config.mts` — the chat renders Markdown with `react-markdown`, whose dependencies include CommonJS packages that the **Vite dev server** only loads when pre-bundled (production builds don't need it, but without it `vendure dev` shows a blank dashboard):

```ts
export default defineConfig({
    // ...
    optimizeDeps: {
        include: ['@rahul_vendure/ai-chat-dashboard > react-markdown', '@rahul_vendure/ai-chat-dashboard > remark-gfm'],
    },
});
```

Then rebuild the dashboard (`npx vite build`, or restart `vite` in development). The Vite plugin finds the extension through `AiChatDashboardPlugin`. Building only loads your config, so it doesn't need API keys.

Give non-SuperAdmin roles the `UseAiAdminAssistant` permission under **Settings → Roles**.

### Workspace / monorepo setup

If the packages are symlinked (npm workspaces), Vendure's dashboard extension scanner may not detect them. Add this to your `vite.config.mts`:

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
    optimizeDeps: {
        include: ['react-markdown', 'remark-gfm'],
    },
});
```

## Things to ask

**Catalog and operations**

- "Do we have laptops?" → product cards
- "Products for developers" → semantic search
- "Show orders by John" / "What's the status of order ABC123?" → order cards
- "Find customers named Rahul" → customers with order stats
- "Set the price of Headphones to 120" / "Disable the Camera" → done, or a Confirm card for destructive changes
- "Take me to the promotions page" → opens it

**Business insights**

- "How did sales go in the last 30 days, and what will the next 30 days look like?" → KPI tiles + forecast chart
- "What should I reorder, and how many?" → inventory table
- "Our supplier takes 20 days to deliver." → remembered for this channel; plans use it
- "Where are my customers, and what are my best sellers?" → locations + top products
- "Research competitor prices for my top products and compare them with mine." → cited web research
- "What should I plan for next month?" → forecast, reorders and pricing as a short action list

The assistant doesn't hand you a questionnaire: it works out your location from where orders ship (or the channel's zone) and uses your catalog when there are no sales yet, then states its assumptions in one line. Questions that search the web take about a minute.

## Architecture

This package contains no backend logic:

| Package | Role |
|---------|------|
| `@rahul_vendure/ai-chat-plugin` | Server: models, tools, permissions, REST endpoints under `/admin-ai-chat/*` |
| `@rahul_vendure/ai-chat-dashboard` | Dashboard extension: chat page, toolbar chat, cards, confirmations, insight charts |

Requests go to `/admin-ai-chat/*` with the dashboard's own session and the active channel's token.

## License

AGPL-3.0 — see [LICENSE](./LICENSE).
