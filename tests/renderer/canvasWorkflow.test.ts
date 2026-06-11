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
