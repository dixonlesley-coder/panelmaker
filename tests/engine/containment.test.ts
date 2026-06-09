import { describe, it, expect } from 'vitest';
import {
  cableOuterDiameterMm,
  sizeConduit,
  sizeCircuitConduit,
  sizeCableTray,
  computePanel,
} from '@shared/engine';
import { CONDUIT_SIZES, CONDUIT_FILL_SINGLE, conduitInternalAreaMm2 } from '@shared/standards';
import type { PanelInput, CircuitInput } from '@shared/types';

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
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

describe('cable outer-diameter estimate', () => {
  it('grows with conductor CSA and with core count', () => {
    expect(cableOuterDiameterMm(16, 4)).toBeGreaterThan(cableOuterDiameterMm(4, 4));
    expect(cableOuterDiameterMm(16, 5)).toBeGreaterThan(cableOuterDiameterMm(16, 2));
  });

  it('is roughly realistic for an NYY 4×16 (~17-20 mm)', () => {
    const od = cableOuterDiameterMm(16, 4);
    expect(od).toBeGreaterThan(14);
    expect(od).toBeLessThan(24);
  });

  it('returns 0 for a zero/invalid CSA', () => {
    expect(cableOuterDiameterMm(0, 4)).toBe(0);
  });
});

describe('conduit sizing', () => {
  it('picks a standard conduit whose fill is within the single-cable limit', () => {
    const r = sizeConduit(cableOuterDiameterMm(4, 3));
    expect(CONDUIT_SIZES.some((c) => c.nominalMm === r.conduitSizeMm)).toBe(true);
    expect(r.fillPct).toBeLessThanOrEqual(CONDUIT_FILL_SINGLE * 100 + 1e-6);
  });

  it('needs a larger conduit for a larger cable', () => {
    const small = sizeCircuitConduit(4, 3);
    const large = sizeCircuitConduit(95, 4);
    expect(large.conduitSizeMm).toBeGreaterThan(small.conduitSizeMm);
  });

  it('reports the fill as area over the conduit bore', () => {
    const od = cableOuterDiameterMm(10, 4);
    const r = sizeConduit(od);
    const chosen = CONDUIT_SIZES.find((c) => c.nominalMm === r.conduitSizeMm)!;
    const expectedFill = ((Math.PI / 4) * od * od) / conduitInternalAreaMm2(chosen);
    expect(r.fillPct).toBeCloseTo(expectedFill * 100, 0);
  });
});

describe('cable-tray sizing', () => {
  it('selects a wider tray as more cables are added', () => {
    const few = sizeCableTray([20, 20]);
    const many = sizeCableTray([20, 20, 20, 20, 20, 20, 20, 20]);
    expect(many.widthMm).toBeGreaterThanOrEqual(few.widthMm);
    expect(many.cableCount).toBe(8);
  });

  it('ignores zero-width entries', () => {
    const r = sizeCableTray([18, 0, 0, 22]);
    expect(r.cableCount).toBe(2);
  });
});

describe('containment wired into computePanel', () => {
  it('attaches per-circuit conduit sizing and a panel cable tray', () => {
    const p = panel({
      id: 'P',
      name: 'DB-1',
      circuits: [
        branch({ id: 'c1', name: 'Sockets', loadW: 3000, loadKind: 'socket' }),
        branch({ id: 'c2', name: 'Motor', loadKind: 'motor', motorKw: 22 }),
      ],
    });
    const r = computePanel(p);
    for (const c of r.circuits) {
      expect(c.containment).toBeDefined();
      expect(c.containment!.conduitSizeMm).toBeGreaterThan(0);
      expect(c.containment!.cableOdMm).toBeGreaterThan(0);
    }
    expect(r.cableTray).toBeDefined();
    expect(r.cableTray!.cableCount).toBe(2);
    expect(r.cableTray!.widthMm).toBeGreaterThan(0);
  });
});
