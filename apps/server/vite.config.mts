import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { readdirSync, existsSync, lstatSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig, Plugin } from 'vite';

/**
 * Workaround for Vendure dashboard plugin discovery not scanning symlinked
 * workspace packages. The built-in discovery excludes symlinked packages
 * from its JS glob patterns, so their `dashboard` metadata is never found.
 *
 * This plugin dynamically discovers ALL workspace packages under `packages/`
 * that contain a `src/dashboard/index.tsx` entry point and injects them into
 * the `virtual:dashboard-extensions` module at build/serve time.
 *
 * It uses `transform` (enforce: 'post') to replace the empty module body that
 * the built-in `vendure:dashboard-extensions-metadata` plugin produces.
 *
 * Adding a new plugin with a dashboard? Just put `src/dashboard/index.tsx`
 * in your package — it will be picked up automatically.
 */
function workspaceDashboardExtensions(): Plugin {
    const virtualModuleId = 'virtual:dashboard-extensions';
    const resolvedVirtualModuleId = `\0${virtualModuleId}`;
    const packagesDir = resolve(__dirname, '../../packages');

    function discoverDashboardExtensions(): string[] {
        const extensions: string[] = [];
        if (!existsSync(packagesDir)) return extensions;

        for (const entry of readdirSync(packagesDir)) {
            const pkgDir = join(packagesDir, entry);
            try {
                if (!lstatSync(pkgDir).isDirectory()) continue;
            } catch {
                continue;
            }
            const dashboardEntry = join(pkgDir, 'src/dashboard/index.tsx');
            if (existsSync(dashboardEntry)) {
                extensions.push(dashboardEntry);
            }
        }
        return extensions;
    }

    function generateModule(): string {
        const extensions = discoverDashboardExtensions();
        console.log(
            `[workspace-dashboard-extensions] Discovered ${extensions.length} dashboard extension(s):`,
            extensions.map(e => e.replace(packagesDir + '/', '')),
        );
        const imports = extensions
            .map(ext => `await import('${pathToFileURL(ext).href}');`)
            .join('\n    ');
        return `export async function runDashboardExtensions() {\n    ${imports}\n}`;
    }

    return {
        name: 'vendure:workspace-dashboard-extensions',
        enforce: 'post',
        // Override the virtual module content produced by the built-in Vendure plugin.
        // The `transform` hook runs after `load`, so we can replace the empty body.
        transform(code, id) {
            if (id === resolvedVirtualModuleId) {
                return { code: generateModule(), map: null };
            }
        },
        // Also handle HMR: when any dashboard extension file changes, invalidate
        // the virtual module so Vite re-runs the transform.
        handleHotUpdate({ file, server }) {
            if (file.includes('/packages/') && file.includes('/dashboard/')) {
                const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
                if (mod) {
                    server.moduleGraph.invalidateModule(mod);
                    server.ws.send({ type: 'full-reload' });
                }
            }
        },
    };
}

export default defineConfig({
    base: '/dashboard',
    build: {
        outDir: join(__dirname, 'dist/dashboard'),
    },
    plugins: [
        vendureDashboardPlugin({
            vendureConfigPath: pathToFileURL('./src/vendure-config.ts'),
            // Use 'auto' so the dashboard makes relative requests (e.g. /admin-api)
            // rather than absolute ones. In dev, the Vite proxy below forwards
            // these to the Vendure server on port 3000.
            api: { host: 'auto', port: 'auto' },
            gqlOutputPath: './src/gql',
        }),
        workspaceDashboardExtensions(),
    ],
    server: {
        // Proxy REST & API requests to the Vendure server so the Vite dev
        // server (port 5173) can reach the backend (port 3000) without CORS.
        proxy: {
            '/admin-api': 'http://localhost:3000',
            '/shop-api': 'http://localhost:3000',
            '/admin-ai-chat': 'http://localhost:3000',
        },
    },
    resolve: {
        alias: {
            '@/gql': resolve(__dirname, './src/gql/graphql.ts'),
        },
    },
});
