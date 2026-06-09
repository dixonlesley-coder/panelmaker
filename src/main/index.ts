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
import { ensureLicensed } from './license/session';
import { getLicensingConfig, isDemoEnabled } from './license/config';
import { createSigninWindow } from './license/signinWindow';

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

  // Holds the transient sign-in window so the IPC sign-in hook can close it.
  let signinWindow: BrowserWindow | undefined;

  /** Open the real app window and wire auto-update. */
  function launchApp(): void {
    const win = createMainWindow();
    initAutoUpdater(win);
  }

  void app.whenReady().then(async () => {
    applyContentSecurityPolicy();
    initDatabase();

    // Register IPC first so the (optional) sign-in window can call back in. The
    // onSignedIn hook swaps the sign-in window for the real app window.
    registerIpcHandlers({
      onSignedIn: () => {
        launchApp();
        signinWindow?.close();
        signinWindow = undefined;
      },
    });

    // The licensing gate. Fail-open: when unconfigured / dev / unpackaged,
    // ensureLicensed() returns { licensed: true } so the app starts as before.
    const decision = await ensureLicensed();
    if (decision.licensed) {
      launchApp();
    } else {
      const { allowedHd } = getLicensingConfig();
      signinWindow = createSigninWindow(allowedHd, isDemoEnabled());
    }

    app.on('activate', () => {
      // macOS: re-create a window when the dock icon is clicked and none exist.
      if (BrowserWindow.getAllWindows().length === 0) {
        // Re-run the gate so a locked app re-prompts rather than bypassing it.
        void ensureLicensed().then((d) => {
          if (d.licensed) launchApp();
          else {
            const { allowedHd } = getLicensingConfig();
            signinWindow = createSigninWindow(allowedHd, isDemoEnabled());
          }
        });
      }
    });
  });

  app.on('window-all-closed', () => {
    // Quit on all platforms except macOS, where apps stay resident.
    if (process.platform !== 'darwin') app.quit();
  });
}

bootstrap();
