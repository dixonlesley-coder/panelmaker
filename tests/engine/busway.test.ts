import { describe, it, expect } from 'vitest';
import { computeSystem } from '@shared/engine';
import { selectBuswayRating, BUSWAY_RATINGS_A } from '@shared/standards';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return { system: '3ph', voltageV: 400, ambientTempC: 30, installMethod: 'conduit', groupingCount: 1, diversityFactor: 1, sourceType: 'utility', circuits: [], ...p };
}

describe('busway (busbar trunking) feeder', () => {
  it('selects the next standard busway rating', () => {
    expect(selectBuswayRating(300)).toBe(400);
    expect(selectBuswayRating(630)).toBe(630);
    expect(BUSWAY_RATINGS_A).toContain(800);
  });

  it('a feeder marked busway reports a busway rating + label', () => {
    const project: ProjectInput = {
      id: 'P', name: 'B',
      panels: [
        panel({ id: 'mdp', name: 'MDP', circuits: [
          { id: 'f1', name: 'Riser → Tower DB', role: 'branch', loadW: 0, cosPhi: 0.85, lengthM: 40, loadKind: 'feeder', isLighting: false, demandFactor: 1, feedsPanelId: 'sdp', busway: true } as CircuitInput,
        ] }),
        panel({ id: 'sdp', name: 'Tower DB', sourceType: 'feeder', fedByCircuitId: 'f1', circuits: [
          { id: 'c1', name: 'Load', role: 'branch', loadW: 120000, cosPhi: 0.85, lengthM: 15, loadKind: 'general', isLighting: false, demandFactor: 1 },
        ] }),
      ],
    };
    const sys = computeSystem(project);
    const feeder = sys.panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(feeder.busway).toBeDefined();
    expect(feeder.busway!.ratingA).toBeGreaterThanOrEqual(feeder.designCurrentA);
    expect(BUSWAY_RATINGS_A).toContain(feeder.busway!.ratingA);
    expect(feeder.grounding.cableSpec).toMatch(/Busway/);
  });

  it('a cable feeder is unaffected', () => {
    const project: ProjectInput = {
      id: 'P', name: 'B',
      panels: [
        panel({ id: 'mdp', name: 'MDP', circuits: [
          { id: 'f1', name: 'Feeder', role: 'branch', loadW: 0, cosPhi: 0.85, lengthM: 40, loadKind: 'feeder', isLighting: false, demandFactor: 1, feedsPanelId: 'sdp' } as CircuitInput,
        ] }),
        panel({ id: 'sdp', name: 'DB', sourceType: 'feeder', fedByCircuitId: 'f1', circuits: [
          { id: 'c1', name: 'Load', role: 'branch', loadW: 8000, cosPhi: 0.85, lengthM: 15, loadKind: 'general', isLighting: false, demandFactor: 1 },
        ] }),
      ],
    };
    const feeder = computeSystem(project).panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(feeder.busway).toBeUndefined();
    expect(feeder.grounding.cableSpec).not.toMatch(/Busway/);
  });
});
