import { create } from 'zustand';
import type {
  CircuitInput,
  ControlAssembly,
  ControlSchematic,
  EarthingSystem,
  OccupancyType,
  PanelInput,
  Part,
  ProjectInput,
  ProjectMeta,
  SchematicRung,
  SchematicSymbol,
  SchematicSymbolType,
  SiteConditions,
  SourcesConfig,
  SuggestedFix,
} from '@shared/types';
import { buildSchematic, mergeSchematic } from '@shared/engine';
import { desktopApi, persistSchematic } from '@renderer/api';
import { createSampleProject } from '@renderer/data/sampleProject';
import { findPanelTemplate } from '@renderer/data/panelTemplates';
import { SAMPLE_PARTS, SAMPLE_PRICES } from '@renderer/data/sampleParts';
import {
  deleteProject as registryDeleteProject,
  loadProject as registryLoadProject,
  saveProject as registrySaveProject,
} from '@renderer/lib/projectsRegistry';

export type Screen =
  | 'projects'
  | 'system'
  | 'dashboard'
  | 'panel'
  | 'coordination'
  | 'parts'
  | 'pricelist'
  | 'quotation'
  | 'sources'
  | 'settings';

/**
 * Collision-resistant id for circuits/panels/schematic elements created at
 * runtime. These ids are PERSISTED with the project (autosave round-trips the
 * whole graph), so a plain in-memory counter collides after an app relaunch —
 * session 2's `c-rt1` duplicates session 1's, and every id-keyed update then
 * patches both rows. UUIDs make ids unique across sessions by construction; the
 * timestamped counter is only a fallback for environments without crypto.
 */
let runtimeSeq = 0;
const nextId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-rt${Date.now().toString(36)}-${(runtimeSeq += 1)}`;
};

/** Schematic rungs/symbols are persisted too — same collision-safe generator. */
const nextSchematicId = nextId;

/** Maximum number of undoable project states retained. */
const HISTORY_LIMIT = 50;

/**
 * Consecutive same-field keystrokes coalesce into ONE undo step when they land
 * within this window, so Ctrl+Z undoes "rename the circuit", not one character.
 */
const HISTORY_COALESCE_MS = 1200;

/** A fresh, collision-resistant project id for new/duplicated projects. */
function freshProjectId(): string {
  return nextId('PRJ');
}

export interface ProjectState {
  project: ProjectInput;
  parts: Part[];
  prices: Record<string, number>;
  activePanelId: string;
  activeScreen: Screen;
  /** Control/ladder schematics, keyed by circuitId. */
  schematics: Record<string, ControlSchematic>;
  /** Undo stack: prior project states, oldest first (capped at HISTORY_LIMIT). */
  past: ProjectInput[];
  /** Redo stack: states undone away from, newest first. */
  future: ProjectInput[];
  /**
   * The coalescing tag of the most recent history push: keystroke-driven edits
   * to the same field within {@link HISTORY_COALESCE_MS} reuse the existing undo
   * snapshot instead of pushing one per character. Cleared by undo/redo and by
   * any non-coalescing edit.
   */
  lastEdit: { key: string; at: number } | null;
  /**
   * A copied circuit held outside project history, ready to paste into any
   * panel. Stored as a deep clone so later edits never mutate the clipboard.
   */
  circuitClipboard: CircuitInput | null;

  // navigation
  setScreen: (screen: Screen) => void;
  setActivePanel: (panelId: string) => void;

  // circuit editing
  updateCircuit: (panelId: string, circuitId: string, patch: Partial<CircuitInput>) => void;
  addCircuit: (panelId: string) => void;
  removeCircuit: (panelId: string, circuitId: string) => void;
  /** Clone a circuit in place: fresh id, "(copy)" name, inserted after the source. */
  duplicateCircuit: (panelId: string, circuitId: string) => void;
  /** Copy a circuit to the clipboard (deep clone, outside project history). */
  copyCircuit: (panelId: string, circuitId: string) => void;
  /** Paste the clipboard circuit (fresh id) onto a panel, enabling cross-panel copy. */
  pasteCircuit: (panelId: string) => void;
  /** Apply the same partial patch to several circuits in a panel (one undo step). */
  bulkUpdateCircuits: (panelId: string, ids: string[], patch: Partial<CircuitInput>) => void;
  /** Remove several circuits from a panel in a single undoable step. */
  removeCircuits: (panelId: string, ids: string[]) => void;
  /**
   * Reorder a panel's circuits to match `orderedIds` (the new left-to-right /
   * top-to-bottom sequence from the visual builder). Ids not present keep their
   * relative order at the end; unknown ids are ignored. One undoable step.
   */
  reorderCircuits: (panelId: string, orderedIds: string[]) => void;
  /**
   * Pin each listed single-phase circuit to a line (L1/L2/L3) — the result of a
   * one-click phase auto-balance. Circuits absent from the map are left as-is.
   * One undoable step.
   */
  setPhaseAssignments: (panelId: string, assignment: Record<string, 'L1' | 'L2' | 'L3'>) => void;
  /** Append a fully-configured circuit (fresh id) to a panel — used by the wizard. */
  addCircuitConfigured: (panelId: string, circuit: Omit<CircuitInput, 'id'>) => void;

  // panel editing
  updatePanel: (panelId: string, patch: Partial<PanelInput>) => void;
  addPanel: () => void;
  /**
   * Drop a sub-panel onto a parent: creates the child panel AND the feeder
   * circuit in the parent (cross-wired feedsPanelId/fedByCircuitId) as one
   * undoable step. Returns nothing; the child becomes the active panel.
   */
  addSubPanel: (parentPanelId: string) => void;
  /**
   * Wire an EXISTING unassigned panel under a parent: adds a feeder circuit in
   * the parent feeding the child and flips the child to feeder-fed (cross-wired),
   * as one undoable step. No-op if it would create a feeder cycle or the child
   * already has a parent.
   */
  connectPanelAsFeeder: (parentPanelId: string, childPanelId: string) => void;
  /** Set (or clear) a panel's building occupancy class. */
  setPanelOccupancy: (panelId: string, occupancy: OccupancyType | undefined) => void;
  /** Append a new panel built from a template (fresh ids) and select it. */
  addPanelFromTemplate: (templateId: string) => void;

  // fixes
  applyFix: (panelId: string, circuitId: string, fix: SuggestedFix) => void;

  // pricing
  /** Merge imported unit prices (partId -> price) into the active price map. */
  mergePrices: (prices: Record<string, number>) => void;

  // energy sources
  /** Merge a partial energy-sources config into the project. */
  updateSources: (patch: Partial<SourcesConfig>) => void;

  // earthing
  /** Set the installation earthing system. */
  setEarthingSystem: (system: EarthingSystem) => void;

  // site conditions (lightning exposure / soil) — drive SPD + electrode design
  /** Merge a partial site-conditions patch into the project. */
  setSiteConditions: (patch: Partial<SiteConditions>) => void;

  // load-list import
  /**
   * Append imported panels (e.g. from a CSV load list) to the project as one
   * undoable step. Panel/circuit ids are remapped to fresh runtime ids so a
   * re-import (or generated `panel-1`-style ids) can never collide with
   * existing ones.
   */
  importPanels: (panels: PanelInput[]) => void;

  // branding / title-block metadata
  /** Merge a partial branding/title-block metadata patch into the project. */
  setProjectMeta: (patch: Partial<ProjectMeta>) => void;

  // undo / redo (project edits only)
  /** Restore the previous project state (no-op when the past stack is empty). */
  undo: () => void;
  /** Re-apply the most recently undone project state. */
  redo: () => void;

  // project lifecycle
  /** Replace the entire working project (e.g. autosave restore on launch). Resets history. */
  replaceProject: (project: ProjectInput) => void;
  /** Start a fresh project (seeded sample with a new id/name). Resets history + persists. */
  newProject: (name?: string) => Promise<void>;
  /** Load a stored project by id and make it the working project. */
  openProject: (id: string) => Promise<boolean>;
  /** Duplicate the active project under a new id (and "(copy)" name); persists it. */
  duplicateActiveProject: () => Promise<string>;
  /** Rename the active project (persisted; not an undoable edit). */
  renameProject: (name: string) => Promise<void>;
  /** Delete a stored project by id; if it was active, falls back to a fresh project. */
  deleteProjectById: (id: string) => Promise<boolean>;

  // control schematics
  /** Build the schematic from the assembly the first time it is requested. */
  ensureSchematic: (circuitId: string, assembly: ControlAssembly) => void;
  /** Re-run generation, preserving any hand-authored (manual) rungs. */
  regenerateSchematic: (circuitId: string, assembly: ControlAssembly) => void;
  /** Append a blank manual rung the user can drop symbols into. */
  addRung: (circuitId: string) => void;
  /** Append a manual symbol at the next free column on a rung. */
  addSymbol: (circuitId: string, rungId: string, type: SchematicSymbolType) => void;
  /** Remove a single symbol from a schematic. */
  removeSymbol: (circuitId: string, symbolId: string) => void;
  /** Remove a manual (unlocked) rung and its symbols. */
  removeRung: (circuitId: string, rungId: string) => void;
  /** Detach a rung so a future regenerate will not clobber it. */
  detachRung: (circuitId: string, rungId: string) => void;
}

/** Immutably map over the project's panels, replacing the one matching `panelId`. */
function mapPanel(
  project: ProjectInput,
  panelId: string,
  fn: (panel: PanelInput) => PanelInput,
): ProjectInput {
  return {
    ...project,
    panels: project.panels.map((p) => (p.id === panelId ? fn(p) : p)),
  };
}

/** A structural deep clone (circuits are plain JSON-safe data). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep-clone a circuit, assigning it a fresh runtime id. */
function cloneCircuit(circuit: CircuitInput): CircuitInput {
  return { ...deepClone(circuit), id: nextId('c') };
}

/** Immutably map over a panel's circuits, replacing the one matching `circuitId`. */
function mapCircuit(
  panel: PanelInput,
  circuitId: string,
  fn: (circuit: CircuitInput) => CircuitInput,
): PanelInput {
  return {
    ...panel,
    circuits: panel.circuits.map((c) => (c.id === circuitId ? fn(c) : c)),
  };
}

/**
 * Immutably transform the schematic for `circuitId`. The transform receives the
 * existing schematic (or `undefined` if none) and returns the next one; returning
 * `undefined` leaves the map unchanged.
 */
function mapSchematic(
  schematics: Record<string, ControlSchematic>,
  circuitId: string,
  fn: (existing: ControlSchematic | undefined) => ControlSchematic | undefined,
): Record<string, ControlSchematic> {
  const next = fn(schematics[circuitId]);
  if (next === undefined) return schematics;
  return { ...schematics, [circuitId]: next };
}

/** The next unused series column on a rung (max existing col + 1, or 0 if empty). */
function nextFreeCol(schematic: ControlSchematic, rungId: string): number {
  const cols = schematic.symbols.filter((s) => s.rungId === rungId).map((s) => s.col);
  return cols.length === 0 ? 0 : Math.max(...cols) + 1;
}

/** True when a schematic carries no hand-authored content (safe to replace). */
function schematicPristine(schematic: ControlSchematic): boolean {
  return schematic.rungs.every((r) => r.generated) && schematic.symbols.every((sy) => sy.generated);
}

/**
 * Debounced, best-effort persistence of an edited schematic (desktop SQLite;
 * no-op on web). Hand-authored rungs/symbols previously lived only in memory and
 * silently vanished on restart even though the IPC + repo existed end-to-end.
 */
const schematicSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function queuePersistSchematic(circuitId: string): void {
  const prev = schematicSaveTimers.get(circuitId);
  if (prev !== undefined) clearTimeout(prev);
  schematicSaveTimers.set(
    circuitId,
    setTimeout(() => {
      schematicSaveTimers.delete(circuitId);
      const schematic = useProjectStore.getState().schematics[circuitId];
      if (schematic) void persistSchematic(schematic);
    }, 800),
  );
}

/** Circuits whose persisted schematic has already been looked up this session. */
const hydratedSchematics = new Set<string>();

/**
 * Load a previously persisted (hand-edited) schematic for the circuit, replacing
 * the freshly generated one — unless the user has already started editing it.
 */
function hydrateSchematic(circuitId: string): void {
  if (hydratedSchematics.has(circuitId)) return;
  hydratedSchematics.add(circuitId);
  const api = desktopApi();
  if (!api) return;
  void api
    .loadSchematic(circuitId)
    .then((saved) => {
      if (!saved) return;
      useProjectStore.setState((s) => {
        const current = s.schematics[circuitId];
        // Keep in-memory work if the user already authored something this session.
        if (!current || !schematicPristine(current)) return s;
        return { schematics: { ...s.schematics, [circuitId]: saved } };
      });
    })
    .catch(() => undefined);
}

/**
 * Apply an undoable project edit: compute the next project from the current
 * state and, when it actually changed, push the PREVIOUS project onto the undo
 * stack (capped at {@link HISTORY_LIMIT}) and clear the redo stack. Schematic and
 * price edits do not flow through here and stay out of project history.
 *
 * `coalesceKey` (keystroke-driven edits: a circuit name, a panel field, …) makes
 * consecutive same-key edits within {@link HISTORY_COALESCE_MS} share ONE undo
 * snapshot — the one taken before the first keystroke — so undo restores whole
 * edits, and a 12-character rename doesn't evict 12 slots of history.
 */
function withHistory(
  s: ProjectState,
  next: (project: ProjectInput) => ProjectInput,
  coalesceKey?: string,
): Pick<ProjectState, 'project' | 'past' | 'future' | 'lastEdit'> {
  const project = next(s.project);
  if (project === s.project) {
    return { project: s.project, past: s.past, future: s.future, lastEdit: s.lastEdit };
  }
  const now = Date.now();
  const coalesce =
    coalesceKey !== undefined &&
    s.past.length > 0 &&
    s.lastEdit !== null &&
    s.lastEdit.key === coalesceKey &&
    now - s.lastEdit.at <= HISTORY_COALESCE_MS;
  const past = coalesce ? s.past : [...s.past, s.project].slice(-HISTORY_LIMIT);
  const lastEdit = coalesceKey !== undefined ? { key: coalesceKey, at: now } : null;
  return { project, past, future: [], lastEdit };
}

const initialProject = createSampleProject();

export const useProjectStore = create<ProjectState>((set) => ({
  project: initialProject,
  parts: SAMPLE_PARTS,
  prices: SAMPLE_PRICES,
  activePanelId: initialProject.panels[0]?.id ?? '',
  activeScreen: 'system',
  schematics: {},
  past: [],
  future: [],
  lastEdit: null,
  circuitClipboard: null,

  setScreen: (screen) => set({ activeScreen: screen }),
  setActivePanel: (panelId) => set({ activePanelId: panelId }),

  updateCircuit: (panelId, circuitId, patch) =>
    set((s) =>
      withHistory(
        s,
        (project) =>
          mapPanel(project, panelId, (panel) =>
            mapCircuit(panel, circuitId, (c) => ({ ...c, ...patch })),
          ),
        `c:${panelId}:${circuitId}:${Object.keys(patch).sort().join('+')}`,
      ),
    ),

  addCircuit: (panelId) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => {
          const newCircuit: CircuitInput = {
            id: nextId('c'),
            name: `New circuit ${panel.circuits.length + 1}`,
            role: 'branch',
            loadW: 1000,
            cosPhi: 0.85,
            lengthM: 20,
            loadKind: 'general',
            isLighting: false,
            demandFactor: 1,
          };
          return { ...panel, circuits: [...panel.circuits, newCircuit] };
        }),
      ),
    ),

  removeCircuit: (panelId, circuitId) =>
    set((s) => {
      // Drop the circuit's schematic too, so a future circuit can never inherit
      // a stale one (schematics live outside project history by design).
      const { [circuitId]: _dropped, ...schematics } = s.schematics;
      return {
        ...withHistory(s, (project) =>
          mapPanel(project, panelId, (panel) => ({
            ...panel,
            circuits: panel.circuits.filter((c) => c.id !== circuitId),
          })),
        ),
        schematics,
      };
    }),

  duplicateCircuit: (panelId, circuitId) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => {
          const index = panel.circuits.findIndex((c) => c.id === circuitId);
          if (index === -1) return panel;
          const source = panel.circuits[index]!;
          const copy: CircuitInput = { ...cloneCircuit(source), name: `${source.name} (copy)` };
          const circuits = [...panel.circuits];
          circuits.splice(index + 1, 0, copy);
          return { ...panel, circuits };
        }),
      ),
    ),

  reorderCircuits: (panelId, orderedIds) =>
    set((s) => {
      const panel = s.project.panels.find((p) => p.id === panelId);
      if (!panel) return s;
      const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
      // Stable sort by the requested rank; circuits absent from orderedIds
      // (rank = +Infinity) keep their existing relative position at the end.
      const circuits = panel.circuits
        .map((c, i) => ({ c, i }))
        .sort((a, b) => {
          const ra = rank.get(a.c.id) ?? Number.POSITIVE_INFINITY;
          const rb = rank.get(b.c.id) ?? Number.POSITIVE_INFINITY;
          return ra === rb ? a.i - b.i : ra - rb;
        })
        .map((x) => x.c);
      // No change (dropped back in place) — leave state untouched so a stray
      // drag doesn't churn the undo stack or mark the project dirty.
      if (circuits.every((c, i) => c === panel.circuits[i])) return s;
      return withHistory(s, (project) =>
        mapPanel(project, panelId, (p) => ({ ...p, circuits })),
      );
    }),

  setPhaseAssignments: (panelId, assignment) =>
    set((s) => {
      if (Object.keys(assignment).length === 0) return s;
      return withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({
          ...panel,
          circuits: panel.circuits.map((c) =>
            assignment[c.id] ? { ...c, phaseOverride: assignment[c.id] } : c,
          ),
        })),
      );
    }),

  copyCircuit: (panelId, circuitId) =>
    set((s) => {
      const panel = s.project.panels.find((p) => p.id === panelId);
      const circuit = panel?.circuits.find((c) => c.id === circuitId);
      if (!circuit) return s;
      // Deep clone so subsequent edits never reach back into the clipboard.
      return { circuitClipboard: deepClone(circuit) };
    }),

  pasteCircuit: (panelId) =>
    set((s) => {
      const clip = s.circuitClipboard;
      if (!clip) return s;
      return withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({
          ...panel,
          circuits: [...panel.circuits, cloneCircuit(clip)],
        })),
      );
    }),

  bulkUpdateCircuits: (panelId, ids, patch) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      return withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({
          ...panel,
          circuits: panel.circuits.map((c) => (idSet.has(c.id) ? { ...c, ...patch } : c)),
        })),
      );
    }),

  removeCircuits: (panelId, ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      const schematics = Object.fromEntries(
        Object.entries(s.schematics).filter(([cid]) => !idSet.has(cid)),
      );
      return {
        ...withHistory(s, (project) =>
          mapPanel(project, panelId, (panel) => ({
            ...panel,
            circuits: panel.circuits.filter((c) => !idSet.has(c.id)),
          })),
        ),
        schematics,
      };
    }),

  addCircuitConfigured: (panelId, circuit) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({
          ...panel,
          circuits: [...panel.circuits, { ...circuit, id: nextId('c') }],
        })),
      ),
    ),

  updatePanel: (panelId, patch) =>
    set((s) =>
      withHistory(
        s,
        (project) => mapPanel(project, panelId, (panel) => ({ ...panel, ...patch })),
        `p:${panelId}:${Object.keys(patch).sort().join('+')}`,
      ),
    ),

  addPanel: () =>
    set((s) => {
      const newPanel: PanelInput = {
        id: nextId('P'),
        name: `New panel ${s.project.panels.length + 1}`,
        system: '3ph',
        voltageV: 400,
        ambientTempC: 35,
        installMethod: 'conduit',
        groupingCount: 3,
        diversityFactor: 0.8,
        sourceType: 'utility',
        circuits: [],
      };
      return {
        ...withHistory(s, (project) => ({ ...project, panels: [...project.panels, newPanel] })),
        activePanelId: newPanel.id,
        activeScreen: 'system',
      };
    }),

  addSubPanel: (parentPanelId) =>
    set((s) => {
      const parent = s.project.panels.find((p) => p.id === parentPanelId);
      if (!parent) return s;
      const childId = nextId('P');
      const feederId = nextId('c');
      const child: PanelInput = {
        id: childId,
        name: `Sub-panel ${s.project.panels.length + 1}`,
        system: parent.system,
        voltageV: parent.voltageV,
        ambientTempC: parent.ambientTempC,
        installMethod: parent.installMethod,
        groupingCount: parent.groupingCount,
        diversityFactor: 0.8,
        sourceType: 'feeder',
        fedByCircuitId: feederId,
        circuits: [],
      };
      const feeder: CircuitInput = {
        id: feederId,
        name: `Feeder → ${child.name}`,
        role: 'branch',
        loadW: 0,
        cosPhi: 0.85,
        lengthM: 20,
        loadKind: 'feeder',
        isLighting: false,
        demandFactor: 1,
        feedsPanelId: childId,
      };
      // Stay on the parent: the new feeder way appears in the parent's own
      // single-line (the MCB that feeds the sub-panel), so the user sees the
      // connection in place instead of being thrown into the empty child build.
      // Drill into the child by double-clicking its feeder way.
      return withHistory(s, (project) => ({
        ...project,
        panels: [
          ...project.panels.map((p) =>
            p.id === parentPanelId ? { ...p, circuits: [...p.circuits, feeder] } : p,
          ),
          child,
        ],
      }));
    }),

  connectPanelAsFeeder: (parentPanelId, childPanelId) =>
    set((s) => {
      if (parentPanelId === childPanelId) return s;
      const parent = s.project.panels.find((p) => p.id === parentPanelId);
      const child = s.project.panels.find((p) => p.id === childPanelId);
      if (!parent || !child) return s;

      // child -> its parent, to detect existing parents and cycles.
      const parentOf = new Map<string, string>();
      for (const p of s.project.panels) {
        for (const c of p.circuits) if (c.feedsPanelId) parentOf.set(c.feedsPanelId, p.id);
      }
      if (parentOf.has(childPanelId)) return s; // already assigned — only adopt orphans
      // Walk up from the parent; reaching the child means this would cycle.
      let cur: string | undefined = parentPanelId;
      const seen = new Set<string>();
      while (cur !== undefined && !seen.has(cur)) {
        if (cur === childPanelId) return s;
        seen.add(cur);
        cur = parentOf.get(cur);
      }

      const feederId = nextId('c');
      const feeder: CircuitInput = {
        id: feederId,
        name: `Feeder → ${child.tag ?? child.name}`,
        role: 'branch',
        loadW: 0,
        cosPhi: 0.85,
        lengthM: 20,
        loadKind: 'feeder',
        isLighting: false,
        demandFactor: 1,
        feedsPanelId: childPanelId,
      };
      return withHistory(s, (project) => ({
        ...project,
        panels: project.panels.map((p) => {
          if (p.id === parentPanelId) return { ...p, circuits: [...p.circuits, feeder] };
          if (p.id === childPanelId) {
            return { ...p, sourceType: 'feeder' as const, fedByCircuitId: feederId };
          }
          return p;
        }),
      }));
    }),

  addPanelFromTemplate: (templateId) =>
    set((s) => {
      const template = findPanelTemplate(templateId);
      if (!template) return s;
      const newPanel = template.build();
      // Disambiguate the name if a panel with this template name already exists.
      const sameName = s.project.panels.filter((p) => p.name.startsWith(newPanel.name)).length;
      if (sameName > 0) newPanel.name = `${newPanel.name} ${sameName + 1}`;
      return {
        ...withHistory(s, (project) => ({ ...project, panels: [...project.panels, newPanel] })),
        activePanelId: newPanel.id,
        activeScreen: 'system',
      };
    }),

  setPanelOccupancy: (panelId, occupancy) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => {
          if (occupancy === undefined) {
            const { occupancy: _drop, ...rest } = panel;
            return rest;
          }
          return { ...panel, occupancy };
        }),
      ),
    ),

  applyFix: (panelId, circuitId, fix) =>
    set((s) => {
      const action = fix.action;
      if (!action) return s;
      if (action.type === 'set-cable') {
        const csaMm2 = action.payload.csaMm2;
        if (typeof csaMm2 !== 'number') return s;
        return withHistory(s, (project) =>
          mapPanel(project, panelId, (panel) =>
            mapCircuit(panel, circuitId, (c) => ({ ...c, cableOverrideMm2: csaMm2 })),
          ),
        );
      }
      if (action.type === 'clear-breaker-override') {
        return withHistory(s, (project) =>
          mapPanel(project, panelId, (panel) =>
            mapCircuit(panel, circuitId, (c) => {
              const { breakerOverrideA: _drop, ...rest } = c;
              return rest;
            }),
          ),
        );
      }
      return s;
    }),

  mergePrices: (prices) => set((s) => ({ prices: { ...s.prices, ...prices } })),

  updateSources: (patch) =>
    set((s) =>
      withHistory(
        s,
        (project) => ({ ...project, sources: { ...project.sources, ...patch } }),
        `src:${Object.keys(patch).sort().join('+')}`,
      ),
    ),

  setEarthingSystem: (system) =>
    set((s) => withHistory(s, (project) => ({ ...project, earthingSystem: system }))),

  setSiteConditions: (patch) =>
    set((s) =>
      withHistory(
        s,
        (project) => ({ ...project, site: { ...project.site, ...patch } }),
        `site:${Object.keys(patch).sort().join('+')}`,
      ),
    ),

  importPanels: (panels) =>
    set((s) => {
      if (panels.length === 0) return s;
      // Remap every panel/circuit id to a fresh runtime id, fixing up the
      // feeder cross-references (feedsPanelId / fedByCircuitId) consistently.
      const panelIdMap = new Map(panels.map((p) => [p.id, nextId('P')]));
      const circuitIdMap = new Map(
        panels.flatMap((p) => p.circuits.map((c) => [c.id, nextId('c')] as const)),
      );
      const remapped = panels.map((p) => ({
        ...p,
        id: panelIdMap.get(p.id)!,
        fedByCircuitId:
          p.fedByCircuitId !== undefined
            ? (circuitIdMap.get(p.fedByCircuitId) ?? p.fedByCircuitId)
            : undefined,
        circuits: p.circuits.map((c) => ({
          ...c,
          id: circuitIdMap.get(c.id)!,
          feedsPanelId:
            c.feedsPanelId !== undefined
              ? (panelIdMap.get(c.feedsPanelId) ?? c.feedsPanelId)
              : undefined,
        })),
      }));
      return {
        ...withHistory(s, (project) => ({
          ...project,
          panels: [...project.panels, ...remapped],
        })),
        activePanelId: remapped[0]!.id,
      };
    }),

  setProjectMeta: (patch) =>
    set((s) =>
      withHistory(
        s,
        (project) => ({ ...project, meta: { ...project.meta, ...patch } }),
        `meta:${Object.keys(patch).sort().join('+')}`,
      ),
    ),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1]!;
      const past = s.past.slice(0, -1);
      const future = [s.project, ...s.future].slice(0, HISTORY_LIMIT);
      const activePanelId = previous.panels.some((p) => p.id === s.activePanelId)
        ? s.activePanelId
        : (previous.panels[0]?.id ?? '');
      return { project: previous, past, future, activePanelId, lastEdit: null };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0]!;
      const future = s.future.slice(1);
      const past = [...s.past, s.project].slice(-HISTORY_LIMIT);
      const activePanelId = next.panels.some((p) => p.id === s.activePanelId)
        ? s.activePanelId
        : (next.panels[0]?.id ?? '');
      return { project: next, past, future, activePanelId, lastEdit: null };
    }),

  replaceProject: (project) => {
    // The in-memory schematics belong to the outgoing project; clear the
    // hydration cache so the incoming project's schematics reload from disk.
    hydratedSchematics.clear();
    set({
      project,
      activePanelId: project.panels[0]?.id ?? '',
      schematics: {},
      past: [],
      future: [],
      lastEdit: null,
    });
  },

  newProject: async (name) => {
    const project: ProjectInput = {
      ...createSampleProject(),
      id: freshProjectId(),
      name: name && name.trim().length > 0 ? name.trim() : 'New project',
    };
    useProjectStore.getState().replaceProject(project);
    await registrySaveProject(project);
  },

  openProject: async (id) => {
    const project = await registryLoadProject(id);
    if (!project) return false;
    useProjectStore.getState().replaceProject(project);
    useProjectStore.setState({ activeScreen: 'system' });
    return true;
  },

  duplicateActiveProject: async () => {
    const current = useProjectStore.getState().project;
    const copy: ProjectInput = {
      ...current,
      id: freshProjectId(),
      name: `${current.name} (copy)`,
    };
    await registrySaveProject(copy);
    return copy.id;
  },

  renameProject: async (name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    set((s) => ({ project: { ...s.project, name: trimmed } }));
    await registrySaveProject(useProjectStore.getState().project);
  },

  deleteProjectById: async (id) => {
    const deleted = await registryDeleteProject(id);
    if (!deleted) return false;
    const state = useProjectStore.getState();
    if (state.project.id === id) {
      await state.newProject();
    }
    return true;
  },

  ensureSchematic: (circuitId, assembly) => {
    set((s) => {
      if (s.schematics[circuitId]) return s;
      return {
        schematics: { ...s.schematics, [circuitId]: buildSchematic(assembly) },
      };
    });
    // Restore any hand-edited schematic persisted on a previous run (desktop).
    hydrateSchematic(circuitId);
  },

  regenerateSchematic: (circuitId, assembly) => {
    set((s) => {
      const regenerated = buildSchematic(assembly);
      const existing = s.schematics[circuitId] ?? regenerated;
      return {
        schematics: {
          ...s.schematics,
          [circuitId]: mergeSchematic(existing, regenerated),
        },
      };
    });
    queuePersistSchematic(circuitId);
  },

  addRung: (circuitId) => {
    set((s) => ({
      schematics: mapSchematic(s.schematics, circuitId, (existing) => {
        if (!existing) return undefined;
        const order = existing.rungs.reduce((max, r) => Math.max(max, r.order + 1), 0);
        const rung: SchematicRung = {
          id: nextSchematicId('rung'),
          order,
          label: `Custom rung ${existing.rungs.filter((r) => !r.generated).length + 1}`,
          generated: false,
          locked: false,
        };
        return { ...existing, rungs: [...existing.rungs, rung] };
      }),
    }));
    queuePersistSchematic(circuitId);
  },

  addSymbol: (circuitId, rungId, type) => {
    set((s) => ({
      schematics: mapSchematic(s.schematics, circuitId, (existing) => {
        if (!existing) return undefined;
        const rung = existing.rungs.find((r) => r.id === rungId);
        // Only allow dropping symbols onto manual, unlocked rungs.
        if (!rung || rung.locked) return undefined;
        const symbol: SchematicSymbol = {
          id: nextSchematicId('sym'),
          rungId,
          type,
          col: nextFreeCol(existing, rungId),
          branch: 0,
          generated: false,
        };
        return { ...existing, symbols: [...existing.symbols, symbol] };
      }),
    }));
    queuePersistSchematic(circuitId);
  },

  removeSymbol: (circuitId, symbolId) => {
    set((s) => ({
      schematics: mapSchematic(s.schematics, circuitId, (existing) => {
        if (!existing) return undefined;
        return {
          ...existing,
          symbols: existing.symbols.filter((sym) => sym.id !== symbolId),
          connections: existing.connections.filter(
            (c) => c.fromSymbolId !== symbolId && c.toSymbolId !== symbolId,
          ),
        };
      }),
    }));
    queuePersistSchematic(circuitId);
  },

  removeRung: (circuitId, rungId) => {
    set((s) => ({
      schematics: mapSchematic(s.schematics, circuitId, (existing) => {
        if (!existing) return undefined;
        const rung = existing.rungs.find((r) => r.id === rungId);
        // Locked (generated) rungs cannot be removed.
        if (!rung || rung.locked) return undefined;
        const droppedSymIds = new Set(
          existing.symbols.filter((sym) => sym.rungId === rungId).map((sym) => sym.id),
        );
        return {
          ...existing,
          rungs: existing.rungs.filter((r) => r.id !== rungId),
          symbols: existing.symbols.filter((sym) => sym.rungId !== rungId),
          connections: existing.connections.filter(
            (c) => !droppedSymIds.has(c.fromSymbolId) && !droppedSymIds.has(c.toSymbolId),
          ),
        };
      }),
    }));
    queuePersistSchematic(circuitId);
  },

  detachRung: (circuitId, rungId) => {
    set((s) => ({
      schematics: mapSchematic(s.schematics, circuitId, (existing) => {
        if (!existing) return undefined;
        return {
          ...existing,
          rungs: existing.rungs.map((r) =>
            r.id === rungId ? { ...r, generated: false, locked: false } : r,
          ),
        };
      }),
    }));
    queuePersistSchematic(circuitId);
  },
}));

/** Selector: whether an undo is currently available (the past stack is non-empty). */
export const selectCanUndo = (s: ProjectState): boolean => s.past.length > 0;

/** Selector: whether a redo is currently available (the future stack is non-empty). */
export const selectCanRedo = (s: ProjectState): boolean => s.future.length > 0;

/** Selector: whether a copied circuit is available to paste. */
export const selectHasClipboard = (s: ProjectState): boolean => s.circuitClipboard !== null;
