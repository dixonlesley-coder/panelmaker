/**
 * User-defined panel templates ("save as template"): reusable panel snapshots
 * the user can stamp into any project, alongside the built-in PANEL_TEMPLATES.
 *
 * Persistence is localStorage: available in both the web preview and the
 * Electron renderer (whose localStorage lives in the app's user-data dir),
 * fully offline, and independent of any one project's autosave. The snapshot/
 * instantiate helpers are pure so they unit-test without a DOM.
 */

import type { PanelInput } from '@shared/types';

export interface UserPanelTemplate {
  id: string;
  /** User-chosen template name (becomes the new panel's name when stamped). */
  label: string;
  /** Name of the panel it was saved from, for the picker description. */
  savedFrom: string;
  /** Number of circuits in the snapshot, for the picker description. */
  circuitCount: number;
  /** ISO timestamp of when it was saved. */
  createdAt: string;
  /** The sanitised panel snapshot (ids are placeholders; remapped on stamp). */
  panel: PanelInput;
}

const LS_KEY = 'panelmaker:userTemplates';

/** Collision-resistant id; counter fallback for environments without crypto. */
let seq = 0;
function freshId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-u${Date.now().toString(36)}-${(seq += 1)}`;
}

/** Deep clone (the snapshot must never alias the live project graph). */
function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Sanitise a live panel into a template snapshot: deep-cloned, reset to a
 * standalone root, with feeder ways dropped — they cross-link panels that
 * won't exist wherever the template is stamped, and their load is derived
 * from the sub-panel anyway.
 */
export function toTemplatePanel(panel: PanelInput): PanelInput {
  const snap = clone(panel);
  delete snap.fedByCircuitId;
  snap.sourceType = 'utility';
  snap.circuits = snap.circuits.filter((c) => c.feedsPanelId === undefined);
  return snap;
}

/** Stamp a template into a project-ready panel: fresh panel + circuit ids. */
export function instantiateTemplate(template: UserPanelTemplate): PanelInput {
  const panel = clone(template.panel);
  panel.id = freshId('P');
  panel.name = template.label;
  panel.circuits = panel.circuits.map((c) => ({ ...c, id: freshId('c') }));
  return panel;
}

/** Build a template record from a live panel (label falls back to its name). */
export function createUserTemplate(label: string, panel: PanelInput): UserPanelTemplate {
  const snap = toTemplatePanel(panel);
  return {
    id: freshId('utpl'),
    label: label.trim() || panel.name,
    savedFrom: panel.name,
    circuitCount: snap.circuits.length,
    createdAt: new Date().toISOString(),
    panel: snap,
  };
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Shallow shape check so a corrupted entry can't crash the picker. */
function isUserTemplate(value: unknown): value is UserPanelTemplate {
  const t = value as UserPanelTemplate;
  return Boolean(
    t &&
      typeof t.id === 'string' &&
      typeof t.label === 'string' &&
      t.panel &&
      Array.isArray(t.panel.circuits),
  );
}

/** Load all stored templates ([] when none, unreadable, or no storage). */
export function loadUserTemplates(): UserPanelTemplate[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isUserTemplate) : [];
  } catch {
    return [];
  }
}

/** Persist the full template list (best-effort; quota errors keep in-memory state). */
export function persistUserTemplates(templates: UserPanelTemplate[]): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(templates));
  } catch {
    /* quota / serialization — the in-store copy still works this session */
  }
}
