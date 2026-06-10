import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const shared = fileURLToPath(new URL('./src/shared', import.meta.url));
const renderer = fileURLToPath(new URL('./src/renderer', import.meta.url));
const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * electron-vite configuration.
 *
 *   - `main`     bundles the Node main process. Native/heavy deps are kept
 *                external so they load from node_modules at runtime.
 *   - `preload`  bundles the context-isolated bridge.
 *   - `renderer` REUSES the existing repo-root index.html + src/renderer entry
 *                (owned by the renderer agent) with the same @shared/@renderer
 *                aliases as vite.config.ts, so both the standalone browser build
 *                and the Electron shell run identical renderer code.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
    // Build-time injection of the Google Workspace licensing credentials.
    // `src/main/license/config.ts` reads these via `process.env.*`; on an
    // end-user machine the runtime env won't have them, so we bake whatever is
    // present at BUILD time into the main bundle. Absent at build => '' => the
    // gate stays fail-open (with the runtime `license.config.json` fallback
    // still available). Dev (`electron-vite dev`), CI and Vitest are unaffected
    // — they read the real runtime env, not this define.
    define: {
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
      'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? ''),
      'process.env.ALLOWED_HD': JSON.stringify(process.env.ALLOWED_HD ?? ''),
      // Demo/test account: OPT-IN (off unless enabled). For a *test* build set
      // PANELMAKER_ENABLE_DEMO=1 (and optionally DEMO_EMAIL/DEMO_PASSWORD); a
      // production release simply leaves it unset and ships with no demo bypass.
      // PANELMAKER_DISABLE_DEMO=1 is baked too as a hard kill-switch.
      'process.env.PANELMAKER_ENABLE_DEMO': JSON.stringify(process.env.PANELMAKER_ENABLE_DEMO ?? ''),
      'process.env.PANELMAKER_DISABLE_DEMO': JSON.stringify(process.env.PANELMAKER_DISABLE_DEMO ?? ''),
      ...(process.env.DEMO_EMAIL ? { 'process.env.DEMO_EMAIL': JSON.stringify(process.env.DEMO_EMAIL) } : {}),
      ...(process.env.DEMO_PASSWORD ? { 'process.env.DEMO_PASSWORD': JSON.stringify(process.env.DEMO_PASSWORD) } : {}),
    },
    build: {
      rollupOptions: {
        // Native module + ORM must not be bundled into the main chunk.
        external: ['better-sqlite3', 'drizzle-orm'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared },
    },
    build: {
      rollupOptions: {
        // Emit a CommonJS `.cjs` preload. The package is `type: module`, but a
        // SANDBOXED preload (webPreferences.sandbox: true) must be CommonJS, and
        // a `.js` file here would be treated as ESM. `.cjs` forces CJS so the
        // preload actually loads under the sandbox (otherwise window.api is
        // undefined in every window).
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root,
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': shared,
        '@renderer': renderer,
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'index.html'),
      },
    },
  },
});
