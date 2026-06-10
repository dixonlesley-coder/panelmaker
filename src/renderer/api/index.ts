import type {
  Api,
  CatalogExtractResult,
  LicenseDecisionResult,
  LicenseStatusResult,
  UpdateStatus,
} from '@shared/ipc-contract';
import type { ControlSchematic, Part, ProjectInput } from '@shared/types';

type WindowWithApi = Window & typeof globalThis & { api?: Api };

/** The Electron-exposed API, or undefined when running as a plain web page. */
export function desktopApi(): Api | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as WindowWithApi).api;
}

/** True when running inside the Electron desktop shell (persistence available). */
export function isDesktop(): boolean {
  return desktopApi() !== undefined;
}

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'web' | 'cancelled' | 'error'; message: string };

const WEB_MESSAGE =
  'Available in the desktop app — run PanelMaker under Electron to save and export to disk.';

/** Persist the whole project graph to the local SQLite database (desktop only). */
export async function saveProjectToDisk(project: ProjectInput): Promise<ActionResult> {
  const api = desktopApi();
  if (!api) return { ok: false, reason: 'web', message: WEB_MESSAGE };
  try {
    await api.saveProject(project);
    return { ok: true, message: `Saved "${project.name}".` };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/**
 * Open a catalogue PDF and extract its ordering tables with the bundled
 * extractor (desktop only). Returns `null` on the web (no Electron bridge).
 */
export async function extractCatalogPdf(pages?: string): Promise<CatalogExtractResult | null> {
  const api = desktopApi();
  if (!api) return null;
  return api.extractCatalogPdf(pages);
}

/** Export the whole-system PDF via a native save dialog (desktop only). */
export async function exportSystemPdf(project: ProjectInput): Promise<ActionResult> {
  const api = desktopApi();
  if (!api) return { ok: false, reason: 'web', message: WEB_MESSAGE };
  try {
    const path = await api.chooseSavePath(`${project.name} - system.pdf`);
    if (!path) return { ok: false, reason: 'cancelled', message: 'Export cancelled.' };
    const res = await api.exportSystemPdf(project, path);
    return { ok: true, message: `Exported system report to ${res.filePath}.` };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Export the circuit-label / nameplate sheet PDF via a native save dialog (desktop only). */
export async function exportLabelsPdf(project: ProjectInput): Promise<ActionResult> {
  const api = desktopApi();
  if (!api) return { ok: false, reason: 'web', message: WEB_MESSAGE };
  try {
    const path = await api.chooseSavePath(`${project.name} - labels.pdf`);
    if (!path) return { ok: false, reason: 'cancelled', message: 'Export cancelled.' };
    const res = await api.exportLabelsPdf(project, path);
    return { ok: true, message: `Exported circuit labels to ${res.filePath}.` };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Export the commercial quotation / proposal PDF via a native save dialog (desktop only). */
export async function exportQuotationPdf(
  project: ProjectInput,
  parts: Part[],
  prices: Record<string, number>,
): Promise<ActionResult> {
  const api = desktopApi();
  if (!api) return { ok: false, reason: 'web', message: WEB_MESSAGE };
  try {
    const path = await api.chooseSavePath(`${project.name} - quotation.pdf`);
    if (!path) return { ok: false, reason: 'cancelled', message: 'Export cancelled.' };
    const res = await api.exportQuotationPdf(project, parts, prices, path);
    return { ok: true, message: `Exported quotation to ${res.filePath}.` };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Export a single panel's PDF via a native save dialog (desktop only). */
export async function exportPanelPdf(
  project: ProjectInput,
  panelId: string,
  panelName: string,
): Promise<ActionResult> {
  const api = desktopApi();
  if (!api) return { ok: false, reason: 'web', message: WEB_MESSAGE };
  try {
    const path = await api.chooseSavePath(`${panelName}.pdf`);
    if (!path) return { ok: false, reason: 'cancelled', message: 'Export cancelled.' };
    const res = await api.exportPanelPdf(project, panelId, path);
    return { ok: true, message: `Exported panel report to ${res.filePath}.` };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Best-effort persist of a control schematic when running on the desktop. */
export async function persistSchematic(schematic: ControlSchematic): Promise<void> {
  const api = desktopApi();
  if (!api) return;
  try {
    await api.saveSchematic(schematic);
  } catch {
    /* best-effort; ignore in non-critical autosave */
  }
}

/* -------------------------------- updates --------------------------------- */

/** Installed app version ("web" in the browser build). */
export async function appVersion(): Promise<string> {
  const api = desktopApi();
  return api ? api.appVersion() : 'web';
}

/** Manually check GitHub for a newer release. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const api = desktopApi();
  if (!api) return { state: 'disabled', reason: 'Auto-update runs in the installed desktop app.' };
  return api.checkForUpdates();
}

/** Quit and install a downloaded update. */
export async function installUpdate(): Promise<void> {
  await desktopApi()?.installUpdate();
}

/** Subscribe to auto-update status; no-op (returns a noop unsubscribe) on web. */
export function onUpdateStatus(cb: (status: UpdateStatus) => void): () => void {
  const api = desktopApi();
  if (!api) return () => undefined;
  return api.onUpdateStatus(cb);
}

/* -------------------------------- licensing ------------------------------- */

/**
 * Current licensing status. On the web build (no main process) licensing does
 * not apply, so this reports an unenforced, licensed status and the preview is
 * unaffected.
 */
export async function licenseStatus(): Promise<LicenseStatusResult> {
  const api = desktopApi();
  if (!api) return { enforced: false, licensed: true, reason: 'web' };
  return api.licenseStatus();
}

/** Run the interactive Google Workspace sign-in (desktop only; no-op on web). */
export async function licenseSignIn(): Promise<LicenseDecisionResult> {
  const api = desktopApi();
  if (!api) return { licensed: true, reason: 'web' };
  return api.licenseSignIn();
}

/** Sign in with the demo/test account password (desktop only; no-op on web). */
export async function licenseDemoSignIn(password: string): Promise<LicenseDecisionResult> {
  const api = desktopApi();
  if (!api) return { licensed: true, reason: 'web' };
  return api.licenseDemoSignIn(password);
}

/** Sign out of the licensing session (desktop only; no-op on web). */
export async function licenseSignOut(): Promise<void> {
  await desktopApi()?.licenseSignOut();
}
