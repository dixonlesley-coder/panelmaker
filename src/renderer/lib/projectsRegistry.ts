/**
 * A thin desktop-or-web abstraction for the multi-project lifecycle.
 *
 * On the desktop it delegates to the typed IPC bridge (`window.api`, via
 * {@link desktopApi}); on the web it falls back to a localStorage-backed JSON map
 * so the Projects screen is fully functional in the standalone Vite build too.
 * Both paths return the same {@link ProjectSummary} shape so the UI is identical.
 */

import type { ProjectInput } from '@shared/types';
import type { ProjectSummary } from '@shared/ipc-contract';
import { desktopApi } from '@renderer/api';

/** localStorage key holding the web registry: a map of id -> ProjectInput. */
const REGISTRY_KEY = 'panelmaker:projects';
/** Parallel map of id -> ISO updatedAt, so web summaries can show a timestamp. */
const META_KEY = 'panelmaker:projects:meta';

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readRegistry(): Record<string, ProjectInput> {
  if (!hasLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ProjectInput>) : {};
  } catch {
    return {};
  }
}

function readMeta(): Record<string, string> {
  if (!hasLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeRegistry(map: Record<string, ProjectInput>, meta: Record<string, string>): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(map));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function summarize(project: ProjectInput, updatedAt: string): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    updatedAt,
    panelCount: project.panels.length,
  };
}

/** List stored project summaries, most-recently-updated first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const api = desktopApi();
  if (api) {
    const summaries = await api.listProjects();
    return [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const map = readRegistry();
  const meta = readMeta();
  return Object.values(map)
    .map((p) => summarize(p, meta[p.id] ?? ''))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Load a full project graph by id, or `null` if it does not exist. */
export async function loadProject(id: string): Promise<ProjectInput | null> {
  const api = desktopApi();
  if (api) return api.loadProject(id);
  const map = readRegistry();
  return map[id] ?? null;
}

/** Persist a project (insert or update); returns the saved id. */
export async function saveProject(project: ProjectInput): Promise<string> {
  const api = desktopApi();
  if (api) {
    const res = await api.saveProject(project);
    return res.id;
  }
  const map = readRegistry();
  const meta = readMeta();
  map[project.id] = project;
  meta[project.id] = new Date().toISOString();
  writeRegistry(map, meta);
  return project.id;
}

/** Delete a project by id; returns true when something was removed. */
export async function deleteProject(id: string): Promise<boolean> {
  const api = desktopApi();
  if (api) {
    const res = await api.deleteProject(id);
    return res.deleted;
  }
  const map = readRegistry();
  const meta = readMeta();
  if (!(id in map)) return false;
  delete map[id];
  delete meta[id];
  writeRegistry(map, meta);
  return true;
}
