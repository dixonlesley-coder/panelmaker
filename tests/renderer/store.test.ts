import { describe, it, expect, beforeEach } from 'vitest';
import {
  useProjectStore,
  selectCanUndo,
  selectCanRedo,
  selectHasClipboard,
} from '@renderer/state/projectStore';
import { createSampleProject } from '@renderer/data/sampleProject';
import { PANEL_TEMPLATES } from '@renderer/data/panelTemplates';
import { computeSystem } from '@shared/engine';
import type { Warning } from '@shared/types';

/** Find the first auto-upsized-for-voltage-drop circuit across all panels. */
function findVoltageDropUpsize() {
  const { project } = useProjectStore.getState();
  const result = computeSystem(project);
  for (const panelId of Object.keys(result.panels)) {
    const w = result.panels[panelId]!.warnings.find(
      (x: Warning) => x.code === 'voltage-drop-upsized',
    );
    if (w?.circuitId) return { panelId, circuitId: w.circuitId, result, warning: w };
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

  it('auto-upsizes a long run for voltage drop and notes it (no manual fix needed)', () => {
    const found = findVoltageDropUpsize();
    expect(found, 'sample project should auto-upsize a long run for voltage drop').toBeDefined();
    const { panelId, circuitId, result, warning } = found!;

    // the note is purely informational — the circuit is already within limit
    expect(warning.severity).toBe('info');
    const before = result.panels[panelId]!.circuits.find((c) => c.circuitId === circuitId)!;
    expect(before.voltageDrop.withinLimit).toBe(true);
    expect(before.cable.vdDriven).toBe(true);
  });

  it('applyFix forces an explicit cable override end-to-end (undoable)', () => {
    const found = findVoltageDropUpsize();
    expect(found).toBeDefined();
    const { panelId, circuitId, result } = found!;
    const baseCsa = result.panels[panelId]!.circuits.find((c) => c.circuitId === circuitId)!.cable
      .csaMm2;

    // force a larger conductor than the engine chose; the override rounds up to
    // the next standard section and the cable grows.
    useProjectStore.getState().applyFix(panelId, circuitId, {
      description: 'force larger cable',
      action: { type: 'set-cable', payload: { csaMm2: baseCsa + 1 } },
    });
    const after = computeSystem(useProjectStore.getState().project)
      .panels[panelId]!.circuits.find((c) => c.circuitId === circuitId)!;
    expect(after.cable.csaMm2).toBeGreaterThan(baseCsa);

    // the override is undoable
    useProjectStore.getState().undo();
    const reverted = computeSystem(useProjectStore.getState().project)
      .panels[panelId]!.circuits.find((c) => c.circuitId === circuitId)!;
    expect(reverted.cable.csaMm2).toBe(baseCsa);
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

  describe('panel templates', () => {
    it('addPanelFromTemplate appends a panel with the template circuits and unique ids', () => {
      const template = PANEL_TEMPLATES.find((t) => t.id === 'pump-control')!;
      const expectedCircuits = template.build().circuits.length;
      const startPanels = useProjectStore.getState().project.panels.length;

      useProjectStore.getState().addPanelFromTemplate(template.id);

      const project = useProjectStore.getState().project;
      expect(project.panels.length).toBe(startPanels + 1);
      const added = project.panels[project.panels.length - 1]!;
      expect(added.circuits.length).toBe(expectedCircuits);
      // the new panel becomes active and opens the editor
      expect(useProjectStore.getState().activePanelId).toBe(added.id);
      expect(useProjectStore.getState().activeScreen).toBe('panel');

      // every panel id and circuit id in the project is unique
      const allIds = [
        ...project.panels.map((p) => p.id),
        ...project.panels.flatMap((p) => p.circuits.map((c) => c.id)),
      ];
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('adding the same template twice yields independent fresh-id panels', () => {
      useProjectStore.getState().addPanelFromTemplate('mcc');
      useProjectStore.getState().addPanelFromTemplate('mcc');

      const panels = useProjectStore.getState().project.panels;
      const a = panels[panels.length - 2]!;
      const b = panels[panels.length - 1]!;
      expect(a.id).not.toBe(b.id);
      const aIds = new Set(a.circuits.map((c) => c.id));
      // no circuit id is shared between the two added panels
      expect(b.circuits.some((c) => aIds.has(c.id))).toBe(false);
    });

    it('addPanelFromTemplate is undoable and ignores unknown ids', () => {
      const start = useProjectStore.getState().project.panels.length;
      useProjectStore.getState().addPanelFromTemplate('does-not-exist');
      expect(useProjectStore.getState().project.panels.length).toBe(start);

      useProjectStore.getState().addPanelFromTemplate('lighting-db');
      expect(useProjectStore.getState().project.panels.length).toBe(start + 1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project.panels.length).toBe(start);
    });
  });

  describe('addCircuitConfigured (wizard)', () => {
    it('appends a fully-configured circuit with a fresh id (undoable)', () => {
      const { project } = useProjectStore.getState();
      const panelId = project.panels[0]!.id;
      const start = useProjectStore.getState().project.panels[0]!.circuits.length;

      useProjectStore.getState().addCircuitConfigured(panelId, {
        name: 'Wizard motor',
        role: 'branch',
        loadW: 0,
        cosPhi: 0.85,
        lengthM: 18,
        loadKind: 'motor',
        isLighting: false,
        demandFactor: 1,
        motorKw: 7.5,
        motorPoles: 4,
        starterType: 'STAR_DELTA',
        startingDuty: 'normal',
      });

      const panel = useProjectStore.getState().project.panels[0]!;
      expect(panel.circuits.length).toBe(start + 1);
      const added = panel.circuits[panel.circuits.length - 1]!;
      expect(added.id).toBeTruthy();
      expect(added.name).toBe('Wizard motor');
      expect(added.starterType).toBe('STAR_DELTA');
      // id is unique within the panel
      expect(panel.circuits.filter((c) => c.id === added.id).length).toBe(1);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project.panels[0]!.circuits.length).toBe(start);
    });
  });
});
