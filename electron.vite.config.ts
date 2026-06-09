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
