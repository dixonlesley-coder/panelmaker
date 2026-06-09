/**
 * BrowserWindow creation helper. Centralises the security-hardened window
 * options (context isolation on, node integration off, sandbox on, preload
 * wired) and the dev-vs-prod renderer loading logic.
 */

import { join } from 'node:path';
import { BrowserWindow } from 'electron';

/** Path to the compiled preload script (electron-vite emits CJS to out/preload). */
const PRELOAD_PATH = join(__dirname, '../preload/index.cjs');

/** Create the main application window with hardened web preferences. */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a1b1e',
    title: 'PanelMaker',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No remote module; the renderer talks to main only through the bridge.
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Dev: electron-vite serves the renderer over HTTP; Prod: load the built file.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
