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

const { autoUpdater } = electronUpdater;

let targetWindow: BrowserWindow | undefined;

function send(status: UpdateStatus): void {
  targetWindow?.webContents.send(IPC.updateStatus, status);
}

/** Wire update events and start the periodic check (packaged builds only). */
export function initAutoUpdater(win: BrowserWindow): void {
  targetWindow = win;
  if (!app.isPackaged) {
    send({ state: 'disabled', reason: 'Auto-update runs in the installed app.' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

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
  autoUpdater.on('error', (err) =>
    send({ state: 'error', message: err == null ? 'unknown error' : err.message ?? String(err) }),
  );

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
    if (result?.updateInfo && result.updateInfo.version !== app.getVersion()) {
      return { state: 'available', version: result.updateInfo.version };
    }
    return { state: 'not-available', version: app.getVersion() };
  } catch (e) {
    return { state: 'error', message: (e as Error).message };
  }
}

/** Quit and install a downloaded update. */
export function installUpdate(): void {
  if (app.isPackaged) autoUpdater.quitAndInstall();
}
