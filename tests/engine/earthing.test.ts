import { describe, it, expect } from 'vitest';
import { computeEarthing, circuitRcd, computePanel, computeSystem } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function branch(p: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...p,
  };
}

function panel(circuits: CircuitInput[]): PanelInput {
  return {
    id: 'P',
    name: 'DB',
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.9,
    sourceType: 'utility',
    circuits,
  };
}

describe('computeEarthing', () => {
  it('TT requires RCDs; TN does not', () => {
    expect(computeEarthing('TT', 16).requiresRcd).toBe(true);
    expect(computeEarthing('TN-C-S', 16).requiresRcd).toBe(false);
    expect(computeEarthing('TN-S', 16).requiresRcd).toBe(false);
  });

  it('sizes main bonding (>= half PE, 6-25) and earthing conductors', () => {
    const e = computeEarthing('TN-C-S', 16);
    expect(e.mainBondingConductorMm2).toBe(10); // half of 16 = 8 -> 10
    expect(e.mainEarthingConductorMm2).toBe(16); // min 16
    expect(e.electrodeResistanceTargetOhm).toBe(5);
    const big = computeEarthing('TN-S', 95);
    expect(big.mainBondingConductorMm2).toBe(25); // capped at 25
  });
});

describe('circuitRcd', () => {
  it('TT final circuits get an RCD', () => {
    expect(circuitRcd({ earthingSystem: 'TT', loadKind: 'general', isFinalCircuit: true, designCurrentA: 20 })).toMatchObject({
      required: true,
      ratingMa: 30,
    });
  });
  it('socket / EV circuits get a 30 mA RCD on any system', () => {
    expect(circuitRcd({ earthingSystem: 'TN-C-S', loadKind: 'socket', isFinalCircuit: true, designCurrentA: 16 }).ratingMa).toBe(30);
    expect(circuitRcd({ earthingSystem: 'TN-S', loadKind: 'ev_charger', isFinalCircuit: true, designCurrentA: 32 }).required).toBe(true);
  });
  it('a general TN final circuit needs no RCD', () => {
    expect(circuitRcd({ earthingSystem: 'TN-C-S', loadKind: 'general', isFinalCircuit: true, designCurrentA: 16 }).required).toBe(false);
  });
});

describe('cable cores by neutral need', () => {
  it('1ph finals = 3-core L+N+PE (lighting included), motors = 4-core, 3ph distribution = 5-core', () => {
    const r = computePanel(
      panel([
        branch({ id: 'lt', name: 'Light', loadKind: 'lighting', isLighting: true, loadW: 2000 }),
        branch({ id: 'sk', name: 'Socket', loadKind: 'socket', loadW: 3000 }),
        branch({ id: 'mt', name: 'Motor', loadKind: 'motor', motorKw: 11 }),
        branch({ id: 'gn', name: 'Sub-DB load', loadKind: 'general', loadW: 12000 }),
      ]),
    );
    const cores = (name: string) => r.circuits.find((c) => c.name === name)!.grounding.cores;
    // Every 1ph circuit carries the neutral — the current must return. The
    // neutral-less leg is the switch drop in the room, not the panel final.
    expect(cores('Light')).toBe(3); // 1ph lighting = L+N+PE (3×1.5)
    expect(cores('Socket')).toBe(3); // 1ph + neutral
    expect(cores('Motor')).toBe(4); // 3ph, no neutral
    expect(cores('Sub-DB load')).toBe(5); // 3ph + neutral
  });
});

describe('computeSystem earthing + per-circuit RCD', () => {
  it('TT system marks final circuits with an RCD and designs the earthing', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      earthingSystem: 'TT',
      panels: [panel([branch({ id: 'c1', name: 'Load', loadW: 6000 })])],
    };
    const sys = computeSystem(project);
    expect(sys.earthing.system).toBe('TT');
    expect(sys.earthing.requiresRcd).toBe(true);
    expect(sys.panels['P']!.circuits[0]!.rcd.required).toBe(true);
  });
});
