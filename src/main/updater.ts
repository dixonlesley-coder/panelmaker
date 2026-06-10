/**
 * Auto-update via electron-updater, pulling releases from GitHub Releases (see
 * the `publish` block in electron-builder.yml). On a packaged build it checks
 * on launch and every 6 h, downloads in the background, and reports progress to
 * the renderer over the `update:status` channel. In dev / unpackaged builds it
 * reports `disabled` (auto-update only works in the installed app).
 */

import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { IPC, type UpdateStatus } from '@shared/ipc-contract';
import { isBenignUpdateError } from './updaterErrors';

const { autoUpdater } = electronUpdater;

let targetWindow: BrowserWindow | undefined;
let lastStatus: UpdateStatus | undefined;
let started = false;

function send(status: UpdateStatus): void {
  lastStatus = status;
  targetWindow?.webContents.send(IPC.updateStatus, status);
}

/**
 * Point the updater at `win` and start the periodic check (packaged builds
 * only). Safe to call again when the window is recreated (e.g. macOS activate):
 * it re-points the target and replays the last status, but only wires the
 * autoUpdater listeners + interval once.
 */
export function initAutoUpdater(win: BrowserWindow): void {
  targetWindow = win;
  // The renderer subscribes after its page loads — replay the latest status then.
  win.webContents.on('did-finish-load', () => {
    if (lastStatus) win.webContents.send(IPC.updateStatus, lastStatus);
  });

  if (!app.isPackaged) {
    send({ state: 'disabled', reason: 'Auto-update runs in the installed app.' });
    return;
  }
  if (started) return;
  started = true;

  // Download in the background, but NEVER auto-apply on quit. electron-updater
  // verifies code signatures on Windows/macOS but not on the Linux AppImage, so
  // silently installing on quit could apply an unverified artifact. Installation
  // happens only when the user clicks "Restart & update" (→ quitAndInstall).
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) =>
    send({ state: 'not-available', version: info.version }),
  );
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send({ state: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) => {
    const message = err == null ? 'unknown error' : (err.message ?? String(err));
    // A failed background check (no release feed yet / offline / 404) is the
    // expected state before a release is published — log it, don't alarm the user.
    if (isBenignUpdateError(message)) {
      // eslint-disable-next-line no-console
      console.warn('[panelmaker] update check skipped (no release feed / offline):', message);
      send({ state: 'not-available', version: app.getVersion() });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[panelmaker] update error:', message);
    send({ state: 'error', message });
  });

  // Initial check on launch, then every 6 hours.
  void autoUpdater.checkForUpdates().catch(() => undefined);
  setInterval(
    () => void autoUpdater.checkForUpdates().catch(() => undefined),
    6 * 60 * 60 * 1000,
  );
}

/** Manual check requested from the renderer; returns a snapshot status. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return { state: 'disabled', reason: 'Auto-update runs in the installed app.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    // Trust electron-updater's own semver comparison rather than a string !==,
    // which would treat a downgrade/regression as "available".
    if (result?.isUpdateAvailable) {
      return { state: 'available', version: result.updateInfo.version };
    }
    return { state: 'not-available', version: app.getVersion() };
  } catch (e) {
    const message = (e as Error).message;
    // No release feed / offline reads as "up to date" for a user-driven check,
    // not a 404 stack trace.
    if (isBenignUpdateError(message)) {
      return { state: 'not-available', version: app.getVersion() };
    }
    return { state: 'error', message };
  }
}

/** Quit and install a downloaded update. */
export function installUpdate(): void {
  if (app.isPackaged) autoUpdater.quitAndInstall();
}
