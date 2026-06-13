import { describe, it, expect } from 'vitest';
import { computeSystem } from '@shared/engine';
import { TRANSFORMER_KVA } from '@shared/standards';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return { system: '3ph', voltageV: 400, ambientTempC: 30, installMethod: 'conduit', groupingCount: 1, diversityFactor: 1, sourceType: 'utility', circuits: [], ...p };
}

/** MDP → sub-panel; the feeder optionally includes a dedicated transformer. */
function project(transformer: boolean): ProjectInput {
  return {
    id: 'P', name: 'B',
    panels: [
      panel({ id: 'mdp', name: 'MDP', circuits: [
        { id: 'f1', name: 'Feeder → Annexe', role: 'branch', loadW: 0, cosPhi: 0.85, lengthM: 30, loadKind: 'feeder', isLighting: false, demandFactor: 1, feedsPanelId: 'sub', ...(transformer ? { transformer: true } : {}) } as CircuitInput,
      ] }),
      panel({ id: 'sub', name: 'Annexe DB', sourceType: 'feeder', fedByCircuitId: 'f1', circuits: [
        { id: 'c1', name: 'Load', role: 'branch', loadW: 60000, cosPhi: 0.85, lengthM: 15, loadKind: 'general', isLighting: false, demandFactor: 1 },
      ] }),
    ],
  };
}

describe('dedicated transformer feeder', () => {
  it('sizes the transformer and reports a secondary fault', () => {
    const feeder = computeSystem(project(true)).panels['mdp']!.circuits.find((c) => c.circuitId === 'f1')!;
    expect(feeder.transformer).toBeDefined();
    expect(TRANSFORMER_KVA).toContain(feeder.transformer!.kva);
    expect(feeder.transformer!.secondaryFaultKa).toBeGreaterThan(0);
    expect(feeder.grounding.cableSpec).toMatch(/kVA Tx/);
  });

  it('ISOLATES (lowers) the downstream fault vs a plain cable feeder', () => {
    const withTx = computeSystem(project(true)).panels['sub']!.faultLevelKa ?? 0;
    const plain = computeSystem(project(false)).panels['sub']!.faultLevelKa ?? 0;
    expect(withTx).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(0);
    // The transformer impedance caps the secondary fault well below the LV bus fault.
    expect(withTx).toBeLessThan(plain);
  });
});
