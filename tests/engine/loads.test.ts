import { describe, it, expect } from 'vitest';
import {
  circuitIsThreePhase,
  recommendPhase,
  balancePhases,
  determineSupply,
  sizeGrounding,
  computePanel,
} from '@shared/engine';
import { peConductorSize } from '@shared/standards';
import type { PanelInput } from '@shared/types';

describe('1-phase / 3-phase logic', () => {
  it('keeps small single-phase loads 1ph; large/motor loads 3ph', () => {
    expect(circuitIsThreePhase({ panelSystem: '3ph', kind: 'lighting', loadW: 2000 })).toBe(false);
    expect(circuitIsThreePhase({ panelSystem: '3ph', kind: 'general', loadW: 8000 })).toBe(true);
    expect(circuitIsThreePhase({ panelSystem: '3ph', kind: 'motor', loadW: 0, motorKw: 5.5 })).toBe(true);
    expect(circuitIsThreePhase({ panelSystem: '3ph', kind: 'motor', loadW: 0, motorKw: 1.5 })).toBe(false);
    // everything is single-phase on a single-phase panel
    expect(circuitIsThreePhase({ panelSystem: '1ph', kind: 'motor', loadW: 0, motorKw: 5.5 })).toBe(false);
  });

  it('recommendPhase', () => {
    expect(recommendPhase('lighting', 1000)).toBe('1ph');
    expect(recommendPhase('pump', 0, 11)).toBe('3ph');
  });

  it('balances single-phase circuits across L1/L2/L3', () => {
    const b = balancePhases(
      [
        { id: 'a', threePhase: false, currentA: 10 },
        { id: 'b', threePhase: false, currentA: 10 },
        { id: 'c', threePhase: false, currentA: 10 },
      ],
      '3ph',
    );
    expect(b.L1).toBe(10);
    expect(b.L2).toBe(10);
    expect(b.L3).toBe(10);
    expect(b.imbalancePct).toBe(0);
  });

  it('three-phase circuits load all phases equally', () => {
    const b = balancePhases([{ id: 'm', threePhase: true, currentA: 50 }], '3ph');
    expect(b.L1).toBe(50);
    expect(b.L2).toBe(50);
    expect(b.L3).toBe(50);
    expect(b.assignment['m']).toBe('3ph');
  });
});

describe('supply / transformer (Indonesia 200 kVA LV ceiling)', () => {
  it('direct LV connection under 200 kVA', () => {
    const s = determineSupply(150);
    expect(s.type).toBe('LV');
    expect(s.transformerKva).toBeUndefined();
  });

  it('MV + transformer above 200 kVA', () => {
    const s = determineSupply(300);
    expect(s.type).toBe('MV');
    expect(s.mvVoltageV).toBe(20000);
    expect(s.transformerKva).toBe(400); // 300 / 0.8 = 375 -> next standard 400
    expect(s.transformerPrimaryA).toBeGreaterThan(0);
    expect(s.transformerSecondaryA).toBeGreaterThan(0);
  });
});

describe('grounding / PE conductor sizing (IEC 60364-5-54)', () => {
  it('PE size from phase CSA', () => {
    expect(peConductorSize(10)).toBe(10);
    expect(peConductorSize(25)).toBe(16);
    expect(peConductorSize(50)).toBe(25);
    expect(peConductorSize(120)).toBe(70); // 60 -> next standard 70
  });

  it('describes the cable make-up', () => {
    const oneph = sizeGrounding({ phaseCsaMm2: 2.5, panelSystem: '3ph', threePhase: false });
    expect(oneph.cores).toBe(3); // L + N + PE
    expect(oneph.cableSpec).toContain('3×2.5');

    const motor = sizeGrounding({ phaseCsaMm2: 16, panelSystem: '3ph', threePhase: true, hasNeutral: false });
    expect(motor.cores).toBe(4); // 3L + PE

    const withN = sizeGrounding({ phaseCsaMm2: 16, panelSystem: '3ph', threePhase: true, hasNeutral: true });
    expect(withN.cores).toBe(5); // 3L + N + PE
  });
});

describe('computePanel integration: phase balance + grounding', () => {
  it('balances a mix of single-phase loads and reports grounding', () => {
    const panel: PanelInput = {
      id: 'P',
      name: 'Mixed DB',
      system: '3ph',
      voltageV: 400,
      ambientTempC: 30,
      installMethod: 'conduit',
      groupingCount: 1,
      diversityFactor: 0.8,
      sourceType: 'utility',
      circuits: [
        { id: 'l1', name: 'Lighting A', role: 'branch', loadW: 2000, cosPhi: 0.9, lengthM: 20, loadKind: 'lighting', isLighting: true, demandFactor: 1 },
        { id: 'l2', name: 'Lighting B', role: 'branch', loadW: 2000, cosPhi: 0.9, lengthM: 20, loadKind: 'lighting', isLighting: true, demandFactor: 1 },
        { id: 'l3', name: 'Sockets', role: 'branch', loadW: 2000, cosPhi: 0.9, lengthM: 20, loadKind: 'socket', isLighting: false, demandFactor: 1 },
      ],
    };
    const r = computePanel(panel);
    // three balanced single-phase loads -> one per phase, ~no imbalance
    const phases = r.circuits.map((c) => c.phase).sort();
    expect(phases).toEqual(['L1', 'L2', 'L3']);
    expect(r.phaseBalance.imbalancePct).toBe(0);
    // cores follow the neutral need: a lighting fixture = 2-core (L+PE)
    expect(r.circuits[0]!.grounding.cores).toBe(2);
    const socket = r.circuits.find((c) => c.name === 'Sockets')!;
    expect(socket.grounding.cores).toBe(3); // socket = L+N+PE
    expect(r.circuits[0]!.grounding.peCsaMm2).toBeGreaterThan(0);
  });
});
