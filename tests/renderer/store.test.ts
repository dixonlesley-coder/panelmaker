import { describe, it, expect, beforeEach } from 'vitest';
import {
  useProjectStore,
  selectCanUndo,
  selectCanRedo,
  selectHasClipboard,
} from '@renderer/state/projectStore';
import { createSampleProject } from '@renderer/data/sampleProject';
import { computeSystem } from '@shared/engine';
import type { Warning } from '@shared/types';

/** Find the first voltage-drop warning across all panels in the project. */
function findVoltageDropWarning() {
  const { project } = useProjectStore.getState();
  const result = computeSystem(project);
  for (const panelId of Object.keys(result.panels)) {
    const w = result.panels[panelId]!.warnings.find(
      (x: Warning) => x.code === 'voltage-drop-exceeded' && (x.fixes?.length ?? 0) > 0,
    );
    if (w) return { panelId, warning: w };
  }
  return undefined;
}

describe('projectStore', () => {
  beforeEach(() => {
    // reset to a fresh sample project (and clear history/clipboard) between tests
    useProjectStore.setState({
      project: createSampleProject(),
      past: [],
      future: [],
      circuitClipboard: null,
    });
  });

  it('seeds the realistic sample building', () => {
    const { project } = useProjectStore.getState();
    expect(project.panels.length).toBe(3);
    expect(project.panels.some((p) => p.sourceType === 'utility')).toBe(true);
  });

  it('updateCircuit changes the computed result live', () => {
    const { project, updateCircuit } = useProjectStore.getState();
    const panel = project.panels.find((p) => p.circuits.some((c) => c.loadKind === 'general'))!;
    const circuit = panel.circuits.find((c) => c.loadKind === 'general')!;

    const before = computeSystem(useProjectStore.getState().project).panels[panel.id]!.circuits.find(
      (c) => c.circuitId === circuit.id,
    )!;
    updateCircuit(panel.id, circuit.id, { loadW: circuit.loadW * 4 });
    const after = computeSystem(useProjectStore.getState().project).panels[panel.id]!.circuits.find(
      (c) => c.circuitId === circuit.id,
    )!;

    expect(after.designCurrentA).toBeGreaterThan(before.designCurrentA);
  });

  it('applyFix resolves the seeded voltage-drop violation end-to-end', () => {
    const found = findVoltageDropWarning();
    expect(found, 'sample project should contain a voltage-drop warning').toBeDefined();
    const { panelId, warning } = found!;
    const circuitId = warning.circuitId!;
    const fix = warning.fixes![0]!;

    // before: the circuit is flagged
    const before = computeSystem(useProjectStore.getState().project)
      .panels[panelId]!.warnings.filter((w: Warning) => w.circuitId === circuitId);
    expect(before.some((w) => w.code === 'voltage-drop-exceeded')).toBe(true);

    // apply the suggested cable upsize
    useProjectStore.getState().applyFix(panelId, circuitId, fix);

    // after: the voltage-drop warning is gone for that circuit
    const after = computeSystem(useProjectStore.getState().project)
      .panels[panelId]!.warnings.filter((w: Warning) => w.circuitId === circuitId);
    expect(after.some((w) => w.code === 'voltage-drop-exceeded')).toBe(false);
  });

  it('addCircuit and removeCircuit mutate the active panel', () => {
    const { project, addCircuit, removeCircuit } = useProjectStore.getState();
    const panelId = project.panels[0]!.id;
    const startCount = useProjectStore.getState().project.panels[0]!.circuits.length;

    addCircuit(panelId);
    const added = useProjectStore.getState().project.panels[0]!;
    expect(added.circuits.length).toBe(startCount + 1);

    removeCircuit(panelId, added.circuits[added.circuits.length - 1]!.id);
    expect(useProjectStore.getState().project.panels[0]!.circuits.length).toBe(startCount);
  });

  it('replaceProject swaps the working project and resets the active panel', () => {
    const restored = createSampleProject();
    restored.id = 'RESTORED';
    restored.name = 'Restored project';
    useProjectStore.getState().replaceProject(restored);
    expect(useProjectStore.getState().project.id).toBe('RESTORED');
    expect(useProjectStore.getState().activePanelId).toBe(restored.panels[0]!.id);
  });

  describe('undo / redo', () => {
    it('undo restores the previous project; redo re-applies the edit', () => {
      const { project, updatePanel } = useProjectStore.getState();
      const panelId = project.panels[0]!.id;
      const original = useProjectStore.getState().project;

      updatePanel(panelId, { name: 'Renamed panel' });
      const edited = useProjectStore.getState().project;
      expect(edited.panels[0]!.name).toBe('Renamed panel');
      expect(edited).not.toBe(original);

      useProjectStore.getState().undo();
      // undo restores the exact previous project reference
      expect(useProjectStore.getState().project).toBe(original);

      useProjectStore.getState().redo();
      expect(useProjectStore.getState().project).toBe(edited);
      expect(useProjectStore.getState().project.panels[0]!.name).toBe('Renamed panel');
    });

    it('canUndo / canRedo reflect the history stacks', () => {
      expect(selectCanUndo(useProjectStore.getState())).toBe(false);
      expect(selectCanRedo(useProjectStore.getState())).toBe(false);

      const panelId = useProjectStore.getState().project.panels[0]!.id;
      useProjectStore.getState().updatePanel(panelId, { name: 'Edited' });
      expect(selectCanUndo(useProjectStore.getState())).toBe(true);
      expect(selectCanRedo(useProjectStore.getState())).toBe(false);

      useProjectStore.getState().undo();
      expect(selectCanUndo(useProjectStore.getState())).toBe(false);
      expect(selectCanRedo(useProjectStore.getState())).toBe(true);

      useProjectStore.getState().redo();
      expect(selectCanUndo(useProjectStore.getState())).toBe(true);
      expect(selectCanRedo(useProjectStore.getState())).toBe(false);
    });

    it('a new edit after undo clears the redo stack', () => {
      const panelId = useProjectStore.getState().project.panels[0]!.id;

      useProjectStore.getState().updatePanel(panelId, { name: 'First' });
      useProjectStore.getState().undo();
      expect(selectCanRedo(useProjectStore.getState())).toBe(true);

      // a fresh edit discards the redo future
      useProjectStore.getState().updatePanel(panelId, { name: 'Second' });
      expect(selectCanRedo(useProjectStore.getState())).toBe(false);
      expect(useProjectStore.getState().project.panels[0]!.name).toBe('Second');
    });
  });

  describe('duplicate / copy / paste circuits', () => {
    /** A panel id with at least one branch circuit, plus that circuit. */
    function pickBranch() {
      const { project } = useProjectStore.getState();
      const panel = project.panels.find((p) => p.circuits.some((c) => c.role === 'branch'))!;
      const circuit = panel.circuits.find((c) => c.role === 'branch')!;
      return { panelId: panel.id, circuit };
    }

    it('duplicateCircuit inserts a fresh-id "(copy)" right after the source', () => {
      const { panelId, circuit } = pickBranch();
      const before = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!;
      const startCount = before.circuits.length;
      const srcIndex = before.circuits.findIndex((c) => c.id === circuit.id);

      useProjectStore.getState().duplicateCircuit(panelId, circuit.id);

      const after = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!;
      expect(after.circuits.length).toBe(startCount + 1);
      const copy = after.circuits[srcIndex + 1]!;
      expect(copy.id).not.toBe(circuit.id);
      expect(copy.name).toBe(`${circuit.name} (copy)`);
      expect(copy.loadW).toBe(circuit.loadW);
      // ids are unique across the panel
      const ids = after.circuits.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('duplicateCircuit is undoable', () => {
      const { panelId, circuit } = pickBranch();
      const startCount = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!
        .circuits.length;
      useProjectStore.getState().duplicateCircuit(panelId, circuit.id);
      useProjectStore.getState().undo();
      expect(
        useProjectStore.getState().project.panels.find((p) => p.id === panelId)!.circuits.length,
      ).toBe(startCount);
    });

    it('copyCircuit + pasteCircuit clones into any panel with a fresh id', () => {
      const { project } = useProjectStore.getState();
      const source = project.panels.find((p) => p.circuits.some((c) => c.role === 'branch'))!;
      const target = project.panels.find((p) => p.id !== source.id)!;
      const circuit = source.circuits.find((c) => c.role === 'branch')!;

      expect(selectHasClipboard(useProjectStore.getState())).toBe(false);
      useProjectStore.getState().copyCircuit(source.id, circuit.id);
      expect(selectHasClipboard(useProjectStore.getState())).toBe(true);
      // copying is not an undoable project edit
      expect(selectCanUndo(useProjectStore.getState())).toBe(false);

      const targetStart = useProjectStore.getState().project.panels.find((p) => p.id === target.id)!
        .circuits.length;
      useProjectStore.getState().pasteCircuit(target.id);

      const after = useProjectStore.getState().project.panels.find((p) => p.id === target.id)!;
      expect(after.circuits.length).toBe(targetStart + 1);
      const pasted = after.circuits[after.circuits.length - 1]!;
      expect(pasted.id).not.toBe(circuit.id);
      expect(pasted.name).toBe(circuit.name);
      expect(pasted.loadKind).toBe(circuit.loadKind);
      // paste is undoable
      expect(selectCanUndo(useProjectStore.getState())).toBe(true);
    });

    it('pasteCircuit is a no-op with an empty clipboard', () => {
      const { panelId } = pickBranch();
      const start = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!
        .circuits.length;
      useProjectStore.getState().pasteCircuit(panelId);
      expect(
        useProjectStore.getState().project.panels.find((p) => p.id === panelId)!.circuits.length,
      ).toBe(start);
    });
  });

  describe('bulk edit circuits', () => {
    /** The panel with the most branch circuits, plus its branch ids. */
    function pickMultiBranch() {
      const { project } = useProjectStore.getState();
      const panel = [...project.panels]
        .filter((p) => p.circuits.some((c) => c.role === 'branch'))
        .sort((a, b) => b.circuits.length - a.circuits.length)[0]!;
      const ids = panel.circuits.filter((c) => c.role === 'branch').map((c) => c.id);
      return { panelId: panel.id, ids };
    }

    it('bulkUpdateCircuits patches every selected circuit in one undo step', () => {
      const { panelId, ids } = pickMultiBranch();
      const targetIds = ids.slice(0, 2);

      useProjectStore.getState().bulkUpdateCircuits(panelId, targetIds, { lengthM: 99 });

      const panel = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!;
      for (const c of panel.circuits) {
        if (targetIds.includes(c.id)) expect(c.lengthM).toBe(99);
      }
      // a single undo reverts all of them at once
      useProjectStore.getState().undo();
      const reverted = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!;
      expect(reverted.circuits.filter((c) => c.lengthM === 99).length).toBe(0);
    });

    it('bulkUpdateCircuits with an empty id list is a no-op', () => {
      const { panelId } = pickMultiBranch();
      useProjectStore.getState().bulkUpdateCircuits(panelId, [], { lengthM: 1 });
      expect(selectCanUndo(useProjectStore.getState())).toBe(false);
    });

    it('removeCircuits deletes every listed circuit in one undo step', () => {
      const { panelId, ids } = pickMultiBranch();
      const start = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!
        .circuits.length;
      const toRemove = ids.slice(0, 2);

      useProjectStore.getState().removeCircuits(panelId, toRemove);

      const after = useProjectStore.getState().project.panels.find((p) => p.id === panelId)!;
      expect(after.circuits.length).toBe(start - toRemove.length);
      expect(after.circuits.some((c) => toRemove.includes(c.id))).toBe(false);

      useProjectStore.getState().undo();
      expect(
        useProjectStore.getState().project.panels.find((p) => p.id === panelId)!.circuits.length,
      ).toBe(start);
    });
  });
});
