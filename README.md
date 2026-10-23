# Vendure AI

AI assistants for [Vendure](https://www.vendure.io/) 3.x: a shopping assistant for the storefront, and an admin assistant for the dashboard that manages the store and works as a business analyst (sales, 30-day forecast, inventory planning, competitor research). Runs on OpenAI, Azure OpenAI or any [AI SDK](https://ai-sdk.dev) model.

## Packages

| Package | npm | What it is |
|---|---|---|
| [`ai-chat-plugin`](./packages/ai-chat-plugin) | [`@rahul_vendure/ai-chat-plugin`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-plugin) | Vendure server plugin: models, tools, permissions, embeddings, REST endpoints |
| [`ai-chat-dashboard`](./packages/ai-chat-dashboard) | [`@rahul_vendure/ai-chat-dashboard`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-dashboard) | Admin chat UI for the React dashboard (cards, confirmations, insight charts) |
| [`ai-chat-react`](./packages/ai-chat-react) | [`@rahul_vendure/ai-chat-react`](https://www.npmjs.com/package/@rahul_vendure/ai-chat-react) | Storefront chat widget (React) |

Each package README is the full reference (configuration, providers, endpoints, troubleshooting). This file covers working on the repo.

**Adding the AI to an existing Vendure project?** Follow [SETUP.md](./SETUP.md), a step-by-step guide you can also hand to an AI coding agent.

## Repository layout

```
├── apps/
│   ├── server/          # Vendure dev server using the plugins (dashboard at /dashboard)
│   └── storefront/      # Next.js storefront with the chat widget
├── packages/
│   ├── ai-chat-plugin/  # server plugin + its test suite (e2e/, src/**/*.spec.ts)
│   ├── ai-chat-dashboard/
│   └── ai-chat-react/
└── package.json         # npm workspaces
```

The apps use the local packages through npm workspaces, so changes show up without publishing.

## Local development

### 1. Install

```bash
npm install
```

(When this repo is a git submodule of another workspace, install it on its own: `npm install --prefix "$PWD"`.)

### 2. Database

The plugin needs PostgreSQL with pgvector. The compose file starts one on port 6543:

```bash
cd apps/server && docker compose up -d postgres_db
```

Or use your own Postgres and run `CREATE EXTENSION IF NOT EXISTS vector;` in the database.

### 3. Configure

```bash
cp apps/server/.env.example apps/server/.env          # database, superadmin, OPENAI_API_KEY and/or AZURE_OPENAI_*
cp apps/storefront/.env.example apps/storefront/.env  # VENDURE_SHOP_API_URL=http://localhost:3000/shop-api
```

Pick a provider in `apps/server/.env` — no code changes needed:

- **OpenAI:** `OPENAI_API_KEY` (chat, embeddings, web search).
- **Azure only:** `AZURE_OPENAI_*`, including `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME` for embeddings.
- **Local model (Ollama, vLLM, LM Studio…):** `LLM_BASE_URL`, `LLM_CHAT_MODEL`, `LLM_EMBEDDING_MODEL`, `LLM_EMBEDDING_DIMENSIONS` — e.g. `ollama pull qwen3:14b && ollama pull nomic-embed-text`, then `LLM_BASE_URL=http://localhost:11434/v1`.

For other providers (Anthropic, Google…), pass a model instance in `apps/server/src/vendure-config.ts` — see the plugin's [Model providers](./packages/ai-chat-plugin/README.md#model-providers).

### 4. Run

```bash
npm run populate -w server   # optional: sample catalog and customers
npm run dev                  # server + worker + dashboard, and the storefront
```

| | URL |
|---|---|
| Dashboard | http://localhost:5173/dashboard (Vite, live reload) — or http://localhost:3000/dashboard after `npm run build:dashboard -w server`. Log in with the superadmin from `.env` → **AI → AI Chat**, or the ✨ button in the toolbar |
| Storefront | http://localhost:3001 → chat bubble bottom right |
| Shop / Admin API | http://localhost:3000/shop-api · /admin-api |

Then embed the catalog once: **Settings → Global settings → Embed all** in the dashboard, or `mutation { triggerEmbedAll { jobId } }` on the Admin API. After that, edits are embedded automatically.

### 5. Try it

**Storefront chat:** "I need something to listen to music on a long flight" → "Add it to my cart" → "What's in my cart and what's the total?" → "Any coupons?" → "What shipping options do I have?"

**Dashboard chat:**

- "How did sales go in the last 30 days, and what will the next 30 days look like?" — summary tiles and forecast chart
- "What should I reorder, and how many?" — inventory table; then "Our supplier takes 20 days" and ask again
- "Where are my customers, and what are my best sellers?"
- "Research competitor prices for my top products and compare them with mine." — cited web research (about a minute)
- "What should I plan for next month?"
- "Delete the product X" — a Confirm / Cancel card; nothing happens until you click
- Switch channel in the dashboard and ask again — data, prices and currency follow the channel

Insights need order history. On a fresh database, place a few orders through the storefront, or ask the assistant with a channel that has orders.

## Tests

The plugin's suite runs against a real Postgres with pgvector (one fresh database per test file) and needs no API keys — model calls are stubbed or use AI SDK mock models:

```bash
cd packages/ai-chat-plugin
PGHOST=localhost PGPORT=6543 PGUSER=postgres PGPASSWORD=postgres npx vitest run
```

- `src/**/*.spec.ts` — unit tests (forecasting incl. interval calibration, web fetch SSRF guards, search helpers, stream filtering)
- `e2e/*.e2e-spec.ts` — shop and admin assistants end to end: permissions, confirmations, guest carts, limits, embeddings, storefront search, channel-aware prices, business insights, custom providers
- Real-model test (opt-in): `OPENAI_API_KEY_E2E=sk-… npx vitest run e2e/admin-confirmations-llm.e2e-spec.ts`
- Network test for the page fetcher hits example.com; skip it offline with `SKIP_NETWORK_TESTS=1`

Typecheck: `npm run typecheck` (plugin). The dashboard and widget are type-checked by their consumers' builds.

**Other Vendure versions:** the packages are developed against Vendure 3.5.4 and checked against 3.8.0 by installing the plugin's `src`, `e2e` and dependencies in a scratch folder with `@vendure/core`, `@vendure/common` and `@vendure/testing` pinned to the other version, then running the same suite.

## Releasing

1. Bump `version` in the package's `package.json` and add a `CHANGELOG.md` entry (what changed for users; database changes first).
2. Update the package README if behaviour or options changed — it is what npm shows.
3. Run the plugin suite (and the 3.8 check for plugin changes). Build: `npm run build -w <package>` (the plugin also builds itself on publish).
4. Commit and push, then publish from the package directory:

   ```bash
   cd packages/ai-chat-plugin && npm publish
   cd ../ai-chat-dashboard && npm publish
   cd ../ai-chat-react && npm publish
   ```

   Each publish asks for your npm 2FA code. Publish only the packages that changed. Order doesn't matter, but release the plugin first when the UI needs a new plugin version.
5. Check: `npm view @rahul_vendure/<package> version`. A machine with `min-release-age` in `~/.npmrc` refuses to install a version published minutes ago; use `--min-release-age=0` for that one install.

## License

AGPL-3.0
