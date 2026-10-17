import { PluginCommonModule, VendurePlugin } from '@vendure/core';

/**
 * Adds an AI chat assistant widget to the Vendure admin dashboard.
 *
 * This is a **dashboard-only** plugin — it contains no backend logic.
 * The backend REST endpoint (`POST /admin-ai-chat/chat`) is provided by
 * `@rahul_vendure/ai-chat-plugin`, which must also be installed.
 *
 * Usage:
 * ```ts
 * import { AiAssistantPlugin } from '@rahul_vendure/ai-chat-plugin';
 * import { AiChatDashboardPlugin } from '@rahul_vendure/ai-chat-dashboard';
 *
 * const config: VendureConfig = {
 *     plugins: [
 *         AiAssistantPlugin.init({ openaiApiKey: '...' }),
 *         AiChatDashboardPlugin,
 *     ],
 * };
 * ```
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    // Relative to the compiled dist/ai-chat-dashboard.plugin.js; the raw TSX ships in src/dashboard.
    dashboard: '../src/dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class AiChatDashboardPlugin {}
