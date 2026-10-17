# Changelog

## 0.3.1

### Fixed

- **The dashboard extension could not be built from npm.** The plugin pointed Vite at `dist/dashboard/index.tsx`, but the TSX ships in `src/dashboard/`; it now uses `../src/dashboard/index.tsx`. (0.2.0 and 0.3.0 only worked in workspaces that scan `src/dashboard` directly.)
- **The AI chat could act on a different channel than the one shown.** It read a stale `vendure-selected-channel-token` from localStorage; it now uses the dashboard's active channel (`useChannel()`).
- Confirmation cards show a green check when done, a neutral cross when cancelled and a red warning when the action failed.
- `package.json` is now exported.

## 0.3.0

### Added

- Confirm / Cancel cards for destructive actions requested by the assistant (requires `@rahul_vendure/ai-chat-plugin` >= 0.3.0).
