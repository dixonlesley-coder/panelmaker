/**
 * Preload bridge. Runs in an isolated world with context isolation ON and
 * exposes a typed, minimal `window.api` that forwards to the main process over
 * `ipcRenderer.invoke`. No Node globals or `ipcRenderer` itself are leaked to
 * the renderer — only the methods declared in the shared `Api` contract.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type Api, type UpdateStatus } from '@shared/ipc-contract';
import type { ProjectInput } from '@shared/types/project';
import type { Part } from '@shared/types/parts';
import type { ControlSchematic } from '@shared/types/schematic';
import type { PricelistRowInput } from '@shared/ipc-contract';

const api: Api = {
  listProjects: () => ipcRenderer.invoke(IPC.listProjects),
  loadProject: (id: string) => ipcRenderer.invoke(IPC.loadProject, id),
  saveProject: (project: ProjectInput) => ipcRenderer.invoke(IPC.saveProject, project),
  deleteProject: (id: string) => ipcRenderer.invoke(IPC.deleteProject, id),

  computeProject: (project: ProjectInput) => ipcRenderer.invoke(IPC.computeProject, project),

  listParts: () => ipcRenderer.invoke(IPC.listParts),
  upsertPart: (part: Part) => ipcRenderer.invoke(IPC.upsertPart, part),

  importPricelist: (name: string, rows: PricelistRowInput[], currency?: string) =>
    ipcRenderer.invoke(IPC.importPricelist, name, rows, currency),

  exportPanelPdf: (project: ProjectInput, panelId: string, filePath: string) =>
    ipcRenderer.invoke(IPC.exportPanelPdf, project, panelId, filePath),
  exportSystemPdf: (project: ProjectInput, filePath: string) =>
    ipcRenderer.invoke(IPC.exportSystemPdf, project, filePath),

  saveSchematic: (schematic: ControlSchematic) => ipcRenderer.invoke(IPC.saveSchematic, schematic),
  loadSchematic: (circuitId: string) => ipcRenderer.invoke(IPC.loadSchematic, circuitId),
  chooseSavePath: (defaultName: string) => ipcRenderer.invoke(IPC.chooseSavePath, defaultName),

  appVersion: () => ipcRenderer.invoke(IPC.appVersion),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on(IPC.updateStatus, listener);
    return () => ipcRenderer.removeListener(IPC.updateStatus, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

/** Ambient declaration so the renderer can type `window.api`. */
declare global {
  // eslint-disable-next-line no-var
  interface Window {
    api: Api;
  }
}
