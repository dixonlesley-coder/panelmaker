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
 * Load the most recently saved project to restore on launch: the latest project
 * from SQLite on the desktop, or the last localStorage snapshot on the web.
 * Returns null when nothing has been saved yet (caller falls back to the sample).
 */
export async function loadPersistedProject(): Promise<ProjectInput | null> {
  const api = desktopApi();
  if (api) {
    try {
      const summaries = await api.listProjects();
      if (summaries.length === 0) return null;
      const latest = [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
      return await api.loadProject(latest.id);
    } catch {
      return null;
    }
  }
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectInput;
    return parsed && Array.isArray(parsed.panels) && parsed.panels.length > 0 ? parsed : null;
  } catch {
    return null;
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
