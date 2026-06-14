import { describe, it, expect } from 'vitest';
import { computeSystem } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput, PumpGroupConfig } from '@shared/types';

function pump(id: string, name: string): CircuitInput {
  return {
    id,
    name,
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'pump',
    isLighting: false,
    demandFactor: 1,
    motorKw: 4,
    starterType: 'DOL',
  };
}

function projectWithGroup(group: PumpGroupConfig, circuits: CircuitInput[]): ProjectInput {
  const panel: PanelInput = {
    id: 'MAIN',
    name: 'Pump room',
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.9,
    sourceType: 'utility',
    circuits,
    pumpGroups: [group],
  };
  return { id: 'P', name: 'B', panels: [panel] };
}

describe('computePumpGroup (via computeSystem)', () => {
  it('single-alternate provisions an alternator + level controller and mutual-exclusion interlocks', () => {
    const sys = computeSystem(
      projectWithGroup(
        {
          id: 'g1',
          name: 'Transfer pumps',
          mode: 'single-alternate',
          trigger: 'level',
          sensing: 'float',
          memberCircuitIds: ['p1', 'p2'],
        },
        [pump('p1', 'Pump 1'), pump('p2', 'Pump 2')],
      ),
    );
    const groups = sys.panels['MAIN']!.pumpGroups!;
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.memberCircuitIds).toEqual(['p1', 'p2']);
    // A level controller + an alternator relay.
    expect(g.devices.some((d) => d.category === 'level_relay')).toBe(true);
    expect(g.devices.some((d) => d.category === 'alternator_relay')).toBe(true);
    // One mutual-exclusion interlock between the two run coils.
    expect(g.interlocks).toHaveLength(1);
    expect(g.interlocks[0]!.relation).toBe('mutual_exclusion');
    // The interlock references the members' main contactors.
    expect(g.interlocks[0]!.deviceAId).toBe('p1:main-contactor');
    expect(g.interlocks[0]!.deviceBId).toBe('p2:main-contactor');
    // A generated schematic with a run rung per member + the demand rung.
    expect(g.schematic.rungs.length).toBeGreaterThanOrEqual(3);
    expect(g.warnings).toHaveLength(0);
  });

  it('parallel-alternate uses sequence interlocks (assist staging)', () => {
    const sys = computeSystem(
      projectWithGroup(
        {
          id: 'g2',
          name: 'Booster set',
          mode: 'parallel-alternate',
          trigger: 'pressure',
          memberCircuitIds: ['p1', 'p2', 'p3'],
        },
        [pump('p1', 'Booster 1'), pump('p2', 'Booster 2'), pump('p3', 'Booster 3')],
      ),
    );
    const g = sys.panels['MAIN']!.pumpGroups![0]!;
    expect(g.devices.some((d) => d.category === 'pressure_transmitter')).toBe(true);
    // Sequence: consecutive pairs (p1→p2, p2→p3).
    expect(g.interlocks).toHaveLength(2);
    expect(g.interlocks.every((i) => i.relation === 'sequence')).toBe(true);
  });

  it('warns when a group has too few pumps or a member lacks a starter', () => {
    const noStarter: CircuitInput = { ...pump('p2', 'Pump 2'), starterType: undefined, motorKw: undefined };
    const sys = computeSystem(
      projectWithGroup(
        {
          id: 'g3',
          name: 'Lonely',
          mode: 'single-alternate',
          trigger: 'level',
          memberCircuitIds: ['p1', 'p2'],
        },
        [pump('p1', 'Pump 1'), noStarter],
      ),
    );
    const g = sys.panels['MAIN']!.pumpGroups![0]!;
    // p2 has no starter → warned (and surfaced as a panel warning too).
    expect(g.warnings.some((w) => w.includes('no motor starter'))).toBe(true);
    expect(sys.panels['MAIN']!.warnings.some((w) => w.code === 'pump-group')).toBe(true);
  });

  it('parallel mode adds no cross-pump interlocks and no alternator', () => {
    const sys = computeSystem(
      projectWithGroup(
        {
          id: 'g4',
          name: 'Together',
          mode: 'parallel',
          trigger: 'timer',
          timerOnMin: 5,
          timerOffMin: 10,
          memberCircuitIds: ['p1', 'p2'],
        },
        [pump('p1', 'Pump 1'), pump('p2', 'Pump 2')],
      ),
    );
    const g = sys.panels['MAIN']!.pumpGroups![0]!;
    expect(g.interlocks).toHaveLength(0);
    expect(g.devices.some((d) => d.category === 'alternator_relay')).toBe(false);
    expect(g.devices.some((d) => d.category === 'timer_relay')).toBe(true);
  });
});
