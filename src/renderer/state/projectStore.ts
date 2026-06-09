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
  SchematicRung,
  SchematicSymbol,
  SchematicSymbolType,
  SourcesConfig,
  SuggestedFix,
} from '@shared/types';
import { buildSchematic, mergeSchematic } from '@shared/engine';
import { createSampleProject } from '@renderer/data/sampleProject';
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
  | 'parts'
  | 'pricelist'
  | 'sources'
  | 'settings';

/** A monotonic id generator for circuits/panels created at runtime. */
let runtimeSeq = 0;
const nextId = (prefix: string) => `${prefix}-rt${(runtimeSeq += 1)}`;

/** A separate counter for schematic rungs/symbols authored at runtime. */
let schematicSeq = 0;
const nextSchematicId = (prefix: string) => `${prefix}-rt${(schematicSeq += 1)}`;

/** Maximum number of undoable project states retained. */
const HISTORY_LIMIT = 50;

/** A fresh, collision-resistant project id for new/duplicated projects. */
function freshProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `PRJ-${crypto.randomUUID()}`;
  }
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

  // navigation
  setScreen: (screen: Screen) => void;
  setActivePanel: (panelId: string) => void;

  // circuit editing
  updateCircuit: (panelId: string, circuitId: string, patch: Partial<CircuitInput>) => void;
  addCircuit: (panelId: string) => void;
  removeCircuit: (panelId: string, circuitId: string) => void;

  // panel editing
  updatePanel: (panelId: string, patch: Partial<PanelInput>) => void;
  addPanel: () => void;
  /** Set (or clear) a panel's building occupancy class. */
  setPanelOccupancy: (panelId: string, occupancy: OccupancyType | undefined) => void;

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

/**
 * Apply an undoable project edit: compute the next project from the current
 * state and, when it actually changed, push the PREVIOUS project onto the undo
 * stack (capped at {@link HISTORY_LIMIT}) and clear the redo stack. Schematic and
 * price edits do not flow through here and stay out of project history.
 */
function withHistory(
  s: ProjectState,
  next: (project: ProjectInput) => ProjectInput,
): Pick<ProjectState, 'project' | 'past' | 'future'> {
  const project = next(s.project);
  if (project === s.project) return { project: s.project, past: s.past, future: s.future };
  const past = [...s.past, s.project].slice(-HISTORY_LIMIT);
  return { project, past, future: [] };
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

  setScreen: (screen) => set({ activeScreen: screen }),
  setActivePanel: (panelId) => set({ activePanelId: panelId }),

  updateCircuit: (panelId, circuitId, patch) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) =>
          mapCircuit(panel, circuitId, (c) => ({ ...c, ...patch })),
        ),
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
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({
          ...panel,
          circuits: panel.circuits.filter((c) => c.id !== circuitId),
        })),
      ),
    ),

  updatePanel: (panelId, patch) =>
    set((s) =>
      withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) => ({ ...panel, ...patch })),
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
        activeScreen: 'panel',
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
      if (!action || action.type !== 'set-cable') return s;
      const csaMm2 = action.payload.csaMm2;
      if (typeof csaMm2 !== 'number') return s;
      return withHistory(s, (project) =>
        mapPanel(project, panelId, (panel) =>
          mapCircuit(panel, circuitId, (c) => ({ ...c, cableOverrideMm2: csaMm2 })),
        ),
      );
    }),

  mergePrices: (prices) => set((s) => ({ prices: { ...s.prices, ...prices } })),

  updateSources: (patch) =>
    set((s) =>
      withHistory(s, (project) => ({
        ...project,
        sources: { ...project.sources, ...patch },
      })),
    ),

  setEarthingSystem: (system) =>
    set((s) => withHistory(s, (project) => ({ ...project, earthingSystem: system }))),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1]!;
      const past = s.past.slice(0, -1);
      const future = [s.project, ...s.future].slice(0, HISTORY_LIMIT);
      const activePanelId = previous.panels.some((p) => p.id === s.activePanelId)
        ? s.activePanelId
        : (previous.panels[0]?.id ?? '');
      return { project: previous, past, future, activePanelId };
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
      return { project: next, past, future, activePanelId };
    }),

  replaceProject: (project) =>
    set({ project, activePanelId: project.panels[0]?.id ?? '', schematics: {}, past: [], future: [] }),

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

  ensureSchematic: (circuitId, assembly) =>
    set((s) => {
      if (s.schematics[circuitId]) return s;
      return {
        schematics: { ...s.schematics, [circuitId]: buildSchematic(assembly) },
      };
    }),

  regenerateSchematic: (circuitId, assembly) =>
    set((s) => {
      const regenerated = buildSchematic(assembly);
      const existing = s.schematics[circuitId] ?? regenerated;
      return {
        schematics: {
          ...s.schematics,
          [circuitId]: mergeSchematic(existing, regenerated),
        },
      };
    }),

  addRung: (circuitId) =>
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
    })),

  addSymbol: (circuitId, rungId, type) =>
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
    })),

  removeSymbol: (circuitId, symbolId) =>
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
    })),

  removeRung: (circuitId, rungId) =>
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
    })),

  detachRung: (circuitId, rungId) =>
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
    })),
}));
