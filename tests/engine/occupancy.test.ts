import { describe, it, expect } from 'vitest';
import {
  computeSystem,
  effectiveDiversityFactor,
  circuitDemandFactor,
} from '@shared/engine';
import {
  OCCUPANCY_PRESETS,
  OCCUPANCY_TYPES,
  recommendedDiversity,
  recommendedDemandFactor,
} from '@shared/standards';
import type { PanelInput, ProjectInput, CircuitInput, OccupancyType } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
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
    // 1 = "neutral default": lets occupancy presets apply when set.
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

describe('occupancy presets (standards)', () => {
  it('exposes a preset for every occupancy type', () => {
    for (const t of OCCUPANCY_TYPES) {
      const preset = OCCUPANCY_PRESETS[t];
      expect(preset.diversityFactor).toBeGreaterThan(0);
      expect(preset.diversityFactor).toBeLessThanOrEqual(1);
    }
  });

  it('residential is more diversified (lower factor) than industrial', () => {
    expect(recommendedDiversity('residential')).toBeLessThan(recommendedDiversity('industrial'));
  });

  it('returns per-load-kind demand overrides, or undefined when not overridden', () => {
    expect(recommendedDemandFactor('residential', 'socket')).toBe(
      OCCUPANCY_PRESETS.residential.demandFactors.socket,
    );
    // a kind the preset does not list keeps its own default (undefined here)
    expect(recommendedDemandFactor('residential', 'ev_charger')).toBeUndefined();
  });
});

describe('effective factors (engine/occupancy)', () => {
  it('applies the preset diversity only when the panel value is the neutral default', () => {
    const p = panel({ id: 'P', name: 'House', occupancy: 'residential', diversityFactor: 1 });
    expect(effectiveDiversityFactor(p)).toBe(OCCUPANCY_PRESETS.residential.diversityFactor);
  });

  it('lets an explicit panel diversity factor override the preset', () => {
    const p = panel({ id: 'P', name: 'House', occupancy: 'residential', diversityFactor: 0.95 });
    expect(effectiveDiversityFactor(p)).toBe(0.95);
  });

  it('ignores occupancy when none is set', () => {
    const p = panel({ id: 'P', name: 'X', diversityFactor: 1 });
    expect(effectiveDiversityFactor(p)).toBe(1);
  });

  it('applies a per-load-kind demand factor when the circuit is at the default', () => {
    const p = panel({ id: 'P', name: 'House', occupancy: 'residential' });
    const c = branch({ id: 'c', name: 'Sockets', loadKind: 'socket', demandFactor: 1 });
    expect(circuitDemandFactor(c, p)).toBe(OCCUPANCY_PRESETS.residential.demandFactors.socket);
  });

  it('lets an explicit circuit demand factor override the occupancy preset', () => {
    const p = panel({ id: 'P', name: 'House', occupancy: 'residential' });
    const c = branch({ id: 'c', name: 'Sockets', loadKind: 'socket', demandFactor: 0.9 });
    expect(circuitDemandFactor(c, p)).toBe(0.9);
  });
});

describe('occupancy in computeSystem', () => {
  function makeProject(occupancy?: OccupancyType): ProjectInput {
    return {
      id: 'PRJ',
      name: 'Apartment block',
      panels: [
        panel({
          id: 'P',
          name: 'Apt DB',
          occupancy,
          diversityFactor: 1,
          circuits: [
            branch({ id: 's', name: 'Sockets', loadKind: 'socket', loadW: 12000, demandFactor: 1 }),
            branch({
              id: 'l',
              name: 'Lighting',
              loadKind: 'lighting',
              isLighting: true,
              loadW: 6000,
              demandFactor: 1,
            }),
          ],
        }),
      ],
    };
  }

  it('lowers diversified demand vs the same panel with no occupancy set', () => {
    const withOcc = computeSystem(makeProject('residential'));
    const without = computeSystem(makeProject(undefined));
    expect(withOcc.panels['P']!.totalDemandCurrentA).toBeLessThan(
      without.panels['P']!.totalDemandCurrentA,
    );
    // connected load is also de-rated by the per-kind demand factors
    expect(withOcc.panels['P']!.totalConnectedLoadW).toBeLessThan(
      without.panels['P']!.totalConnectedLoadW,
    );
  });
});
