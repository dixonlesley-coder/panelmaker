import { describe, it, expect } from 'vitest';
import { computeSystem } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 15,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function panel(partial: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

/** 3φ MDP feeding one sub-panel whose system/loads the test varies. */
function project(childSystem: '1ph' | '3ph', childLoadW: number): ProjectInput {
  return {
    id: 'prj',
    name: 'T',
    panels: [
      panel({
        id: 'mdp',
        name: 'MDP',
        circuits: [branch({ id: 'f1', name: 'Feeder → child', loadKind: 'feeder', feedsPanelId: 'child' })],
      }),
      panel({
        id: 'child',
        name: 'Child DB',
        system: childSystem,
        voltageV: childSystem === '1ph' ? 230 : 400,
        sourceType: 'feeder',
        fedByCircuitId: 'f1',
        circuits: [branch({ id: 'c1', name: 'Load', loadW: childLoadW })],
      }),
    ],
  };
}

describe('feeder follows the fed panel', () => {
  it('a 1-phase sub-board takes a 1-phase L+N+PE feeder at the 2.5 mm² floor', () => {
    const sys = computeSystem(project('1ph', 1500)); // ~7 A on one phase
    const feeder = sys.panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(['L1', 'L2', 'L3']).toContain(feeder.phase); // single-phase, balanced onto a line
    expect(feeder.grounding.cores).toBe(3); // L + N + PE
    expect(feeder.cable.csaMm2).toBe(2.5); // capacity allows the small floor
    expect(feeder.grounding.cableSpec).toContain('3×2.5');
  });

  it('a bigger 1-phase sub-board upsizes by capacity (3×4 or more)', () => {
    const sys = computeSystem(project('1ph', 5000)); // ~26 A on one phase
    const feeder = sys.panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(feeder.grounding.cores).toBe(3);
    expect(feeder.cable.csaMm2).toBeGreaterThanOrEqual(4);
  });

  it('a 3-phase sub-board keeps the 4 mm² trunk floor and 5 cores', () => {
    const sys = computeSystem(project('3ph', 1500));
    const feeder = sys.panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(feeder.phase).toBe('3ph');
    expect(feeder.grounding.cores).toBe(5);
    expect(feeder.cable.csaMm2).toBeGreaterThanOrEqual(4);
  });

  it('errors when a 3-phase child hangs under a 1-phase parent (impossible feed)', () => {
    const prj = project('3ph', 1500);
    prj.panels[0]!.system = '1ph';
    prj.panels[0]!.voltageV = 230;
    const sys = computeSystem(prj);
    expect(sys.warnings.some((w) => w.code === 'feeder-phase-mismatch')).toBe(true);
    // The sane direction never fires it.
    expect(
      computeSystem(project('1ph', 1500)).warnings.some((w) => w.code === 'feeder-phase-mismatch'),
    ).toBe(false);
  });
});
