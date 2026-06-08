import { create } from 'zustand';
import type {
  CircuitInput,
  PanelInput,
  Part,
  ProjectInput,
  SuggestedFix,
} from '@shared/types';
import { createSampleProject } from '@renderer/data/sampleProject';
import { SAMPLE_PARTS, SAMPLE_PRICES } from '@renderer/data/sampleParts';

export type Screen = 'system' | 'panel' | 'parts' | 'settings';

/** A monotonic id generator for circuits/panels created at runtime. */
let runtimeSeq = 0;
const nextId = (prefix: string) => `${prefix}-rt${(runtimeSeq += 1)}`;

export interface ProjectState {
  project: ProjectInput;
  parts: Part[];
  prices: Record<string, number>;
  activePanelId: string;
  activeScreen: Screen;

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

const initialProject = createSampleProject();

export const useProjectStore = create<ProjectState>((set) => ({
  project: initialProject,
  parts: SAMPLE_PARTS,
  prices: SAMPLE_PRICES,
  activePanelId: initialProject.panels[0]?.id ?? '',
  activeScreen: 'system',

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
}));
