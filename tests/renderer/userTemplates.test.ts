import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUserTemplate,
  instantiateTemplate,
  loadUserTemplates,
  persistUserTemplates,
  toTemplatePanel,
} from '@renderer/lib/userTemplates';
import { useProjectStore } from '@renderer/state/projectStore';
import { createSampleProject } from '@renderer/data/sampleProject';
import type { CircuitInput, PanelInput } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 2000,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

const sourcePanel: PanelInput = {
  id: 'sp1',
  name: 'Pump room DB',
  tag: 'PP-1',
  system: '3ph',
  voltageV: 400,
  ambientTempC: 35,
  installMethod: 'conduit',
  groupingCount: 3,
  diversityFactor: 0.8,
  sourceType: 'feeder',
  fedByCircuitId: 'feeder-in-mdp',
  circuits: [
    branch({ id: 'c1', name: 'Pump 1', loadKind: 'pump', motorKw: 5.5, starterType: 'DOL' }),
    branch({ id: 'c2', name: 'Sockets' }),
    branch({ id: 'c3', name: 'Feeder to LP', loadKind: 'feeder', feedsPanelId: 'lp-1' }),
  ],
};

describe('toTemplatePanel / instantiateTemplate', () => {
  it('strips feeder cross-links and resets the snapshot to a standalone root', () => {
    const snap = toTemplatePanel(sourcePanel);
    expect(snap.sourceType).toBe('utility');
    expect(snap.fedByCircuitId).toBeUndefined();
    expect(snap.circuits.map((c) => c.name)).toEqual(['Pump 1', 'Sockets']);
    // Deep clone: the original panel is untouched.
    expect(sourcePanel.sourceType).toBe('feeder');
    expect(sourcePanel.circuits).toHaveLength(3);
  });

  it('stamps fresh panel/circuit ids and names the panel after the template', () => {
    const tpl = createUserTemplate('Pump room (typical)', sourcePanel);
    expect(tpl.circuitCount).toBe(2);
    expect(tpl.savedFrom).toBe('Pump room DB');

    const a = instantiateTemplate(tpl);
    const b = instantiateTemplate(tpl);
    expect(a.name).toBe('Pump room (typical)');
    expect(a.id).not.toBe(tpl.panel.id);
    expect(a.id).not.toBe(b.id);
    const ids = [...a.circuits, ...b.circuits].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Config (starter, motor) survives the round-trip.
    expect(a.circuits[0]!.starterType).toBe('DOL');
    expect(a.circuits[0]!.motorKw).toBe(5.5);
  });

  it('falls back to the panel name when the label is blank', () => {
    expect(createUserTemplate('   ', sourcePanel).label).toBe('Pump room DB');
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => {
    // Minimal localStorage shim (node has none).
    const bag = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => bag.get(k) ?? null,
      setItem: (k: string, v: string) => void bag.set(k, v),
      removeItem: (k: string) => void bag.delete(k),
      clear: () => bag.clear(),
      key: () => null,
      get length() {
        return bag.size;
      },
    } as unknown as Storage;
  });

  it('round-trips templates and filters corrupted entries', () => {
    const tpl = createUserTemplate('Typical DB', sourcePanel);
    persistUserTemplates([tpl]);
    const loaded = loadUserTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.label).toBe('Typical DB');
    expect(loaded[0]!.panel.circuits).toHaveLength(2);

    localStorage.setItem('panelmaker:userTemplates', JSON.stringify([tpl, { junk: true }, 42]));
    expect(loadUserTemplates()).toHaveLength(1);

    localStorage.setItem('panelmaker:userTemplates', 'not json');
    expect(loadUserTemplates()).toEqual([]);
  });
});

describe('store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createSampleProject(),
      past: [],
      future: [],
      userTemplates: [],
    });
  });

  it('saves a panel as a template and stamps it back with fresh ids', () => {
    const { saveAsTemplate, addPanelFromUserTemplate, removeUserTemplate } =
      useProjectStore.getState();
    const source = useProjectStore.getState().project.panels[0]!;
    const before = useProjectStore.getState().project.panels.length;

    saveAsTemplate(source.id, 'My typical board');
    const tpl = useProjectStore.getState().userTemplates[0];
    expect(tpl).toBeDefined();
    expect(tpl!.label).toBe('My typical board');

    addPanelFromUserTemplate(tpl!.id);
    const panels = useProjectStore.getState().project.panels;
    expect(panels.length).toBe(before + 1);
    const added = panels.at(-1)!;
    expect(added.name).toBe('My typical board');
    expect(added.id).not.toBe(source.id);
    expect(added.sourceType).toBe('utility');
    // Stamping is undoable like any other project edit.
    expect(useProjectStore.getState().past.length).toBeGreaterThan(0);

    removeUserTemplate(tpl!.id);
    expect(useProjectStore.getState().userTemplates).toHaveLength(0);
  });
});
