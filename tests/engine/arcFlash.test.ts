import { describe, it, expect } from 'vitest';
import { computeArcFlash, computeSystem } from '@shared/engine';
import { ppeCategory } from '@shared/standards';
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

function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...p,
  };
}

describe('ppeCategory thresholds (NFPA 70E)', () => {
  it('maps incident energy to the standard cal/cm² bands', () => {
    expect(ppeCategory(1.0)).toMatch(/PPE 0/);
    expect(ppeCategory(5)).toMatch(/CAT 2/);
    expect(ppeCategory(20)).toMatch(/CAT 3\/4/);
    expect(ppeCategory(35)).toMatch(/CAT 4/);
    expect(ppeCategory(50)).toMatch(/de-energize/i);
  });
});

describe('computeArcFlash (Lee-method estimate)', () => {
  it('returns nothing without a meaningful fault', () => {
    expect(computeArcFlash({ boltedFaultA: 0, voltageV: 400 })).toBeUndefined();
    expect(computeArcFlash({ boltedFaultA: 16000, voltageV: 0 })).toBeUndefined();
  });

  it('produces a higher incident energy for a slower-clearing MCCB bus', () => {
    const mcb = computeArcFlash({ boltedFaultA: 25000, voltageV: 400, incomerClass: 'MCB' })!;
    const mccb = computeArcFlash({ boltedFaultA: 25000, voltageV: 400, incomerClass: 'MCCB' })!;
    expect(mccb.incidentEnergyCalCm2).toBeGreaterThan(mcb.incidentEnergyCalCm2);
    expect(mccb.arcingTimeS).toBeGreaterThan(mcb.arcingTimeS);
    // Boundary > working distance whenever IE > 1.2 cal/cm².
    expect(mccb.arcFlashBoundaryMm).toBeGreaterThan(mccb.workingDistanceMm);
  });

  it('flags a de-energize condition at very high fault / slow clearing', () => {
    const a = computeArcFlash({ boltedFaultA: 60000, voltageV: 400, incomerClass: 'MCCB' })!;
    expect(a.incidentEnergyCalCm2).toBeGreaterThan(40);
    expect(a.ppeCategory).toMatch(/de-energize/i);
    expect(a.note).toMatch(/de-energize/i);
  });
});

describe('arc-flash wired through computeSystem', () => {
  it('attaches an arcFlash estimate to each panel with a known bus fault', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [branch({ id: 'a', name: 'Load', loadW: 20000 })],
        }),
      ],
    };
    const sys = computeSystem(project);
    const main = sys.panels['MAIN']!;
    expect(main.arcFlash).toBeDefined();
    expect(main.arcFlash!.incidentEnergyCalCm2).toBeGreaterThan(0);
    expect(main.arcFlash!.ppeCategory).toBeTruthy();
  });

  it('raises an arc-flash warning on a high-fault MV-fed bus', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [
            branch({ id: 'big', name: 'Big load', loadW: 500_000 }),
            branch({ id: 'sm', name: 'Final', loadW: 3000 }),
          ],
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.supply.type).toBe('MV');
    expect(sys.panels['MAIN']!.arcFlash).toBeDefined();
    expect(
      sys.warnings.some((w) => w.code === 'arc-flash-high' || w.code === 'arc-flash-extreme'),
    ).toBe(true);
  });
});
