/**
 * IPC contract shared by the Electron main process and the renderer (via the
 * preload bridge). This is the single source of truth for channel names and the
 * `Api` surface the renderer can call. Both sides import from here so the wiring
 * stays type-safe end to end.
 *
 * Keep this file free of any Node/Electron/DOM imports — it is consumed by the
 * renderer, the preload and the main process alike.
 */

import type { ProjectInput } from './types/project';
import type { Part, PricelistItem } from './types/parts';
import type { SystemResult } from './types/results';
import type { ControlSchematic } from './types/schematic';

/** A lightweight project summary for list views (avoids loading full graphs). */
export interface ProjectSummary {
  id: string;
  name: string;
  client?: string;
  location?: string;
  updatedAt: string;
  panelCount: number;
}

/** One row of an imported pricelist (part match + price). */
export interface PricelistRowInput {
  /** Catalog part id this row prices, when known. */
  partId?: string;
  /** Free-text key used to match parts when `partId` is absent (e.g. model). */
  matchKey: string;
  unitPrice: number;
  currency?: string;
}

/** Result of importing a pricelist file. */
export interface ImportPricelistResult {
  pricelistId: string;
  itemCount: number;
}

/** Result of a PDF export (the path written + byte size). */
export interface ExportResult {
  filePath: string;
  byteLength: number;
}

/**
 * Channel name constants. Centralised so main and preload cannot drift; the
 * keys mirror the `Api` method names.
 */
export const IPC = {
  listProjects: 'projects:list',
  loadProject: 'projects:load',
  saveProject: 'projects:save',
  deleteProject: 'projects:delete',
  computeProject: 'calc:computeProject',
  listParts: 'parts:list',
  upsertPart: 'parts:upsert',
  importPricelist: 'pricelists:import',
  exportPanelPdf: 'export:panelPdf',
  exportSystemPdf: 'export:systemPdf',
  saveSchematic: 'schematic:save',
  loadSchematic: 'schematic:load',
  chooseSavePath: 'dialog:saveAs',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/**
 * The typed API the preload exposes on `window.api`. Each method maps 1:1 to a
 * channel above and is implemented with `ipcRenderer.invoke` on the renderer
 * side and `ipcMain.handle` on the main side.
 */
export interface Api {
  /** List all stored projects (summaries only). */
  listProjects(): Promise<ProjectSummary[]>;
  /** Load a full project graph, or `null` if it does not exist. */
  loadProject(id: string): Promise<ProjectInput | null>;
  /** Upsert a project (and its panels/circuits); returns the saved id. */
  saveProject(project: ProjectInput): Promise<{ id: string }>;
  /** Delete a project and its children. */
  deleteProject(id: string): Promise<{ deleted: boolean }>;

  /** Run the calculation engine over a project, returning the system result. */
  computeProject(project: ProjectInput): Promise<SystemResult>;

  /** List the parts catalog. */
  listParts(): Promise<Part[]>;
  /** Insert or update a catalog part; returns the stored row. */
  upsertPart(part: Part): Promise<Part>;

  /** Import a named pricelist of rows; returns the new pricelist id + count. */
  importPricelist(
    name: string,
    rows: PricelistRowInput[],
    currency?: string,
  ): Promise<ImportPricelistResult>;

  /**
   * Render a single panel's PDF report and write it to `filePath`.
   * The renderer passes the project plus the target panel id; the main process
   * recomputes the result so the document is always consistent.
   */
  exportPanelPdf(
    project: ProjectInput,
    panelId: string,
    filePath: string,
  ): Promise<ExportResult>;

  /** Render the whole-system PDF report and write it to `filePath`. */
  exportSystemPdf(project: ProjectInput, filePath: string): Promise<ExportResult>;

  /** Persist a circuit's control/ladder schematic (manual edits included). */
  saveSchematic(schematic: ControlSchematic): Promise<{ id: string }>;
  /** Load a circuit's saved schematic, or `null` if none has been saved. */
  loadSchematic(circuitId: string): Promise<ControlSchematic | null>;

  /** Show a native "save as" dialog; returns the chosen path or `null` if cancelled. */
  chooseSavePath(defaultName: string): Promise<string | null>;
}

/** Re-export of the priced item type for renderer convenience. */
export type { PricelistItem };
