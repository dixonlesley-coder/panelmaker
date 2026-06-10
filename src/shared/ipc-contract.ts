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
import type { RawTable } from './data/catalog';

/** Result of an in-app catalogue-PDF extraction (raw tables for review). */
export interface CatalogExtractResult {
  /** True when the user dismissed the file dialog. */
  canceled: boolean;
  /** The chosen PDF's base name (for the review header). */
  pdfName?: string;
  /** Total pages in the PDF (so the UI can hint a page range). */
  pages?: number;
  /** Detected tables (header + rows) for in-app column mapping. */
  tables: RawTable[];
  /** Populated when extraction failed (e.g. the bundled extractor is missing). */
  error?: string;
}

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
 * Result of an interactive sign-in / startup gate check, surfaced to the
 * renderer. On the web build (no main process) this is always
 * `{ licensed: true, reason: 'web' }` so the preview is unaffected.
 */
export interface LicenseDecisionResult {
  licensed: boolean;
  /** Machine-readable reason (e.g. 'web' | 'unenforced' | 'verified-online'). */
  reason: string;
  /** The signed-in email, when a session exists. */
  email?: string;
}

/** Current licensing status for the Settings panel. */
export interface LicenseStatusResult {
  /** Whether the gate is actually enforced (vs. fail-open). */
  enforced: boolean;
  licensed: boolean;
  reason: string;
  email?: string;
  /** Last successful online verification (epoch ms), when known. */
  lastVerifiedAtMs?: number;
}

/** Auto-update lifecycle status pushed from the main process. */
export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: string };

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
  extractCatalogPdf: 'catalog:extractPdf',
  importPricelist: 'pricelists:import',
  exportPanelPdf: 'export:panelPdf',
  exportSystemPdf: 'export:systemPdf',
  exportLabelsPdf: 'export:labelsPdf',
  exportQuotationPdf: 'export:quotationPdf',
  saveSchematic: 'schematic:save',
  loadSchematic: 'schematic:load',
  chooseSavePath: 'dialog:saveAs',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateStatus: 'update:status',
  appVersion: 'app:version',
  licenseStatus: 'license:status',
  licenseSignIn: 'license:signIn',
  licenseDemoSignIn: 'license:demoSignIn',
  licenseSignOut: 'license:signOut',
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

  /**
   * Open a PDF (native file dialog) and extract its ordering tables with the
   * bundled Python extractor. Returns the raw tables for in-app column mapping
   * + review. `pages` is an optional "A-B" page range (default: whole document).
   */
  extractCatalogPdf(pages?: string): Promise<CatalogExtractResult>;

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

  /**
   * Render a grid of per-circuit labels / device nameplates (one per circuit
   * across every panel) and write the PDF to `filePath`.
   */
  exportLabelsPdf(project: ProjectInput, filePath: string): Promise<ExportResult>;

  /**
   * Render the commercial quotation / proposal (priced consolidated BOM + labor
   * and mark-ups from `project.meta.quotation`) and write the PDF to `filePath`.
   * The renderer supplies its parts catalog and the partId→unit-price map so the
   * BOM prices match the on-screen costing.
   */
  exportQuotationPdf(
    project: ProjectInput,
    parts: Part[],
    prices: Record<string, number>,
    filePath: string,
  ): Promise<ExportResult>;

  /** Persist a circuit's control/ladder schematic (manual edits included). */
  saveSchematic(schematic: ControlSchematic): Promise<{ id: string }>;
  /** Load a circuit's saved schematic, or `null` if none has been saved. */
  loadSchematic(circuitId: string): Promise<ControlSchematic | null>;

  /** Show a native "save as" dialog; returns the chosen path or `null` if cancelled. */
  chooseSavePath(defaultName: string): Promise<string | null>;

  /** Installed application version. */
  appVersion(): Promise<string>;
  /** Manually check GitHub for a newer release; returns the resulting status. */
  checkForUpdates(): Promise<UpdateStatus>;
  /** Quit and install a downloaded update. */
  installUpdate(): Promise<void>;
  /** Subscribe to auto-update status events; returns an unsubscribe function. */
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;

  /** Current licensing status (enforced? licensed? signed-in email?). */
  licenseStatus(): Promise<LicenseStatusResult>;
  /** Run the interactive Google Workspace sign-in; returns the decision. */
  licenseSignIn(): Promise<LicenseDecisionResult>;
  /** Sign in with the demo/test account password (bypasses Google, for testing). */
  licenseDemoSignIn(password: string): Promise<LicenseDecisionResult>;
  /** Sign out (clear the stored session); locks the app on next launch. */
  licenseSignOut(): Promise<void>;
}

/** Re-export of the priced item type for renderer convenience. */
export type { PricelistItem };
