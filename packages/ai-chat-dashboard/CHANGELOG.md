# Changelog

## 0.4.2

### Docs

- **Vite dev server setup.** In `vendure dev` / `vite` (not production builds), the chat's Markdown renderer pulls in CommonJS packages that Vite only loads when pre-bundled — without it the dashboard stays blank (`style-to-js … does not provide an export named 'default'`). The README now shows the `optimizeDeps.include` lines to add to `vite.config.mts`.

## 0.4.1

### Changed

- **Long answers no longer look stuck.** While the assistant works, the chat shows how long it has been and that research with web searches can take a minute, instead of only the dots.

### Docs

- README: toolbar quick chat, channel behaviour, every insight card, where **Embed all** lives, prompts to try.

## 0.4.0

### Added

- **Business-insight cards in the AI chat** (needs `@rahul_vendure/ai-chat-plugin` 0.5.0): sales summary KPIs, sales trend bars, a 30-day forecast chart with its likely range and measured accuracy, an inventory reorder table, top products, customer locations (cities/regions/countries) and web sources. Cards are saved with the chat session and shown again when you reopen it.
- Cards without data are not shown.
- Depends on `recharts` `^2.15.4`, the version `@vendure/dashboard` already ships, so no second copy is bundled.

## 0.3.1

### Fixed

- **The dashboard extension could not be built from npm.** The plugin pointed Vite at `dist/dashboard/index.tsx`, but the TSX ships in `src/dashboard/`; it now uses `../src/dashboard/index.tsx`. (0.2.0 and 0.3.0 only worked in workspaces that scan `src/dashboard` directly.)
- **The AI chat could act on a different channel than the one shown.** It read a stale `vendure-selected-channel-token` from localStorage; it now uses the dashboard's active channel (`useChannel()`).
- Confirmation cards show a green check when done, a neutral cross when cancelled and a red warning when the action failed.
- `package.json` is now exported.

## 0.3.0

### Added

- Confirm / Cancel cards for destructive actions requested by the assistant (requires `@rahul_vendure/ai-chat-plugin` >= 0.3.0).
