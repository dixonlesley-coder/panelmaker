import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '@renderer/state/projectStore';
import { createSampleProject } from '@renderer/data/sampleProject';

describe('canvas workflow store behavior', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createSampleProject(),
      past: [],
      future: [],
    });
  });

  it('connectPanelAsFeeder reports why a connect was refused', () => {
    const { addPanel, connectPanelAsFeeder } = useProjectStore.getState();
    const a = addPanel();
    const b = addPanel();

    expect(connectPanelAsFeeder(a, a)).toBe('self');
    expect(connectPanelAsFeeder(a, 'nope')).toBe('missing');
    expect(connectPanelAsFeeder(a, b)).toBe('connected');
    // b already has a parent now — only orphans can be adopted.
    const c = addPanel();
    expect(connectPanelAsFeeder(c, b)).toBe('has-parent');
    // a feeds b; b feeding a would loop.
    expect(connectPanelAsFeeder(b, a)).toBe('cycle');
  });

  it('addPanel returns the new id and names never collide after deletions', () => {
    const { addPanel, removePanel } = useProjectStore.getState();
    const first = addPanel();
    const second = addPanel();
    const names = () => useProjectStore.getState().project.panels.map((p) => p.name);
    expect(useProjectStore.getState().project.panels.some((p) => p.id === first)).toBe(true);
    expect(new Set(names()).size).toBe(names().length);

    // Delete the first; the next added panel must not duplicate the survivor.
    removePanel(first);
    addPanel();
    expect(new Set(names()).size).toBe(names().length);
    expect(useProjectStore.getState().project.panels.some((p) => p.id === second)).toBe(true);
  });

  it('addSpareWays appends N spares as one undoable step with continued numbering', () => {
    const { addPanel, addSpareWays, undo } = useProjectStore.getState();
    const id = addPanel();
    addSpareWays(id, 3);
    const panelOf = () => useProjectStore.getState().project.panels.find((p) => p.id === id)!;
    expect(panelOf().circuits.map((c) => c.name)).toEqual(['Spare 1', 'Spare 2', 'Spare 3']);
    expect(panelOf().circuits.every((c) => c.loadKind === 'spare' && c.demandFactor === 0)).toBe(true);

    addSpareWays(id, 2);
    expect(panelOf().circuits.map((c) => c.name)).toEqual([
      'Spare 1',
      'Spare 2',
      'Spare 3',
      'Spare 4',
      'Spare 5',
    ]);

    // One undo removes the whole second batch.
    undo();
    expect(panelOf().circuits).toHaveLength(3);
  });

  it('attachFloatingLoad preserves the demand factor (drop-on-canvas path)', () => {
    const { addPanel, addFloatingLoad, attachFloatingLoad } = useProjectStore.getState();
    const panelId = addPanel();
    const floatId = addFloatingLoad({
      name: 'Sockets',
      loadKind: 'socket',
      loadW: 2000,
      cosPhi: 0.9,
      demandFactor: 0.7,
      isLighting: false,
      position: { x: 0, y: 0 },
    });
    attachFloatingLoad(floatId, panelId);
    const circuit = useProjectStore
      .getState()
      .project.panels.find((p) => p.id === panelId)!
      .circuits.find((c) => c.name === 'Sockets')!;
    expect(circuit.demandFactor).toBe(0.7);
    expect(useProjectStore.getState().floatingLoads).toHaveLength(0);
  });

  it('addSubPanel names stay unique after deletions too', () => {
    const { addPanel, addSubPanel, removePanel } = useProjectStore.getState();
    const root = addPanel();
    addSubPanel(root);
    addSubPanel(root);
    const subs = () =>
      useProjectStore.getState().project.panels.filter((p) => p.name.startsWith('Sub-panel'));
    expect(subs()).toHaveLength(2);
    removePanel(subs()[0]!.id);
    addSubPanel(root);
    const names = subs().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
