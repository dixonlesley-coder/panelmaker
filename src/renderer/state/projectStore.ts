import { create } from 'zustand';
import type {
  CircuitInput,
  ControlAssembly,
  ControlSchematic,
  EarthingSystem,
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

export type Screen =
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

export interface ProjectState {
  project: ProjectInput;
  parts: Part[];
  prices: Record<string, number>;
  activePanelId: string;
  activeScreen: Screen;
  /** Control/ladder schematics, keyed by circuitId. */
  schematics: Record<string, ControlSchematic>;

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

  // project lifecycle
  /** Replace the entire working project (e.g. autosave restore on launch). */
  replaceProject: (project: ProjectInput) => void;

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

const initialProject = createSampleProject();

export const useProjectStore = create<ProjectState>((set) => ({
  project: initialProject,
  parts: SAMPLE_PARTS,
  prices: SAMPLE_PRICES,
  activePanelId: initialProject.panels[0]?.id ?? '',
  activeScreen: 'system',
  schematics: {},

  setScreen: (screen) => set({ activeScreen: screen }),
  setActivePanel: (panelId) => set({ activePanelId: panelId }),

  updateCircuit: (panelId, circuitId, patch) =>
    set((s) => ({
      project: mapPanel(s.project, panelId, (panel) =>
        mapCircuit(panel, circuitId, (c) => ({ ...c, ...patch })),
      ),
    })),

  addCircuit: (panelId) =>
    set((s) => ({
      project: mapPanel(s.project, panelId, (panel) => {
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
    })),

  removeCircuit: (panelId, circuitId) =>
    set((s) => ({
      project: mapPanel(s.project, panelId, (panel) => ({
        ...panel,
        circuits: panel.circuits.filter((c) => c.id !== circuitId),
      })),
    })),

  updatePanel: (panelId, patch) =>
    set((s) => ({ project: mapPanel(s.project, panelId, (panel) => ({ ...panel, ...patch })) })),

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
        project: { ...s.project, panels: [...s.project.panels, newPanel] },
        activePanelId: newPanel.id,
        activeScreen: 'panel',
      };
    }),

  applyFix: (panelId, circuitId, fix) =>
    set((s) => {
      const action = fix.action;
      if (!action || action.type !== 'set-cable') return s;
      const csaMm2 = action.payload.csaMm2;
      if (typeof csaMm2 !== 'number') return s;
      return {
        project: mapPanel(s.project, panelId, (panel) =>
          mapCircuit(panel, circuitId, (c) => ({ ...c, cableOverrideMm2: csaMm2 })),
        ),
      };
    }),

  mergePrices: (prices) => set((s) => ({ prices: { ...s.prices, ...prices } })),

  updateSources: (patch) =>
    set((s) => ({ project: { ...s.project, sources: { ...s.project.sources, ...patch } } })),

  setEarthingSystem: (system) => set((s) => ({ project: { ...s.project, earthingSystem: system } })),

  replaceProject: (project) =>
    set({ project, activePanelId: project.panels[0]?.id ?? '', schematics: {} }),

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
