/**
 * Electron main entry point.
 *
 * Responsibilities:
 *   - Enforce a single application instance.
 *   - Apply a strict Content-Security-Policy to every response.
 *   - Bring the database up to date (migrate) and seed the catalog on startup.
 *   - Register IPC handlers, then create the main window.
 *   - Standard macOS/Windows lifecycle behaviour.
 */

import { app, BrowserWindow, session } from 'electron';
import { migrate } from './db/migrate';
import { seed } from './db/seed';
import { registerIpcHandlers } from './ipc/handlers';
import { createMainWindow } from './window';
import { initAutoUpdater } from './updater';

/**
 * Strict CSP: only same-origin resources, inline styles allowed for the UI
 * framework, data: images for embedded icons. No remote/CDN sources — the app
 * is fully offline.
 */
const CSP =
  "default-src 'self'; " +
  "img-src 'self' data:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "font-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none'";

/** Attach the CSP header to all responses for the default session. */
function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

/** Initialise persistence: schema migration + idempotent catalog seed. */
function initDatabase(): void {
  const strategy = migrate();
  const result = seed();
  // eslint-disable-next-line no-console
  console.log(
    `[panelmaker] db ready (migrate=${strategy}, seededParts=${result.partsInserted}, pricelist=${result.pricelistCreated})`,
  );
}

function bootstrap(): void {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    applyContentSecurityPolicy();
    initDatabase();
    registerIpcHandlers();
    const win = createMainWindow();
    initAutoUpdater(win);

    app.on('activate', () => {
      // macOS: re-create a window when the dock icon is clicked and none exist.
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Quit on all platforms except macOS, where apps stay resident.
    if (process.platform !== 'darwin') app.quit();
  });
}

bootstrap();
