import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '@renderer/state/projectStore';
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
    // reset to a fresh sample project between tests
    useProjectStore.setState({ project: createSampleProject() });
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
});
