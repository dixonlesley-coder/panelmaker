import type { ProjectInput } from '@shared/types';
import { desktopApi } from '@renderer/api';

const LS_KEY = 'panelmaker:project';

export type AutosaveTarget = 'desktop' | 'local';

/** Where autosave persists: the local SQLite DB (desktop) or localStorage (web). */
export function autosaveTarget(): AutosaveTarget {
  return desktopApi() ? 'desktop' : 'local';
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * Outcome of the launch restore. "Nothing saved yet" and "the load FAILED" must
 * be distinguishable: after a failure the caller must NOT start autosaving the
 * seeded sample, or a transient IPC/DB error would overwrite the user's stored
 * project with a pristine sample.
 */
export type LoadPersistedResult =
  | { ok: true; project: ProjectInput | null }
  | { ok: false };

/**
 * Load the most recently saved project to restore on launch: the latest project
 * from SQLite on the desktop, or the last localStorage snapshot on the web.
 * `{ ok: true, project: null }` means a clean first launch (fall back to the
 * sample); `{ ok: false }` means the store exists but could not be read.
 */
export async function loadPersistedProject(): Promise<LoadPersistedResult> {
  const api = desktopApi();
  if (api) {
    try {
      const summaries = await api.listProjects();
      if (summaries.length === 0) return { ok: true, project: null };
      const latest = [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
      return { ok: true, project: await api.loadProject(latest.id) };
    } catch {
      return { ok: false };
    }
  }
  if (!hasLocalStorage()) return { ok: true, project: null };
  let raw: string | null;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch {
    return { ok: false }; // storage inaccessible — don't write over what we can't read
  }
  if (!raw) return { ok: true, project: null };
  try {
    const parsed = JSON.parse(raw) as ProjectInput;
    const valid = parsed && Array.isArray(parsed.panels) && parsed.panels.length > 0;
    return { ok: true, project: valid ? parsed : null };
  } catch {
    // A corrupted snapshot is unrecoverable garbage — overwriting it loses
    // nothing, so treat it as a clean start (self-heal) rather than a failure.
    return { ok: true, project: null };
  }
}

/** Persist the working project (SQLite on desktop, localStorage on web). */
export async function persistProject(project: ProjectInput): Promise<void> {
  const api = desktopApi();
  if (api) {
    await api.saveProject(project);
    return;
  }
  if (hasLocalStorage()) {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
  }
}

/** Synchronous best-effort flush for `beforeunload` (web localStorage only). */
export function flushProjectSync(project: ProjectInput): void {
  if (!desktopApi() && hasLocalStorage()) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(project));
    } catch {
      /* quota / serialization — ignore */
    }
  }
}
