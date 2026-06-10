import { describe, it, expect } from 'vitest';
import { checkBusbarWithstand, minCsaForWithstand } from '@shared/engine/busbarFault';
import type { BusbarWithstandResult } from '@shared/engine/busbarFault';
import {
  BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2,
  peakFactor,
} from '@shared/standards/busbarFault';

describe('minCsaForWithstand — the section a fault demands', () => {
  it('returns the CSA whose Icw exactly meets the fault, so a bar at it passes', () => {
    // Icw(1 s) = density · csa / 1000 ⇒ csa = faultKa · 1000 / density.
    const csa = minCsaForWithstand(16);
    expect(csa).toBeCloseTo((16 * 1000) / BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2, 6);
    // A bar floored at this CSA is adequate for that fault.
    expect(checkBusbarWithstand(Math.ceil(csa), 16).adequate).toBe(true);
  });

  it('scales with √t and is zero for no fault', () => {
    expect(minCsaForWithstand(0)).toBe(0);
    expect(minCsaForWithstand(16, 0.25)).toBeCloseTo(minCsaForWithstand(16) * 0.5, 6);
  });
});

describe('checkBusbarWithstand — thermal (Icw) adequacy', () => {
  it('flags a small bar under a high fault as inadequate', () => {
    // 50 mm² copper → Icw(1 s) = 80 · 50 / 1000 = 4 kA, well below a 25 kA fault.
    const r: BusbarWithstandResult = checkBusbarWithstand(50, 25);
    expect(r.icwKa).toBeCloseTo(4, 6);
    expect(r.adequate).toBe(false);
  });

  it('passes a large bar that exceeds the prospective fault', () => {
    // 300 mm² copper → Icw(1 s) = 80 · 300 / 1000 = 24 kA ≥ 16 kA fault.
    const r = checkBusbarWithstand(300, 16);
    expect(r.icwKa).toBeCloseTo(24, 6);
    expect(r.adequate).toBe(true);
  });

  it('scales Icw linearly with cross-sectional area', () => {
    const small = checkBusbarWithstand(100, 10);
    const large = checkBusbarWithstand(200, 10);
    expect(large.icwKa).toBeCloseTo(2 * small.icwKa, 6);
    // Anchored to the documented 1-second density.
    expect(small.icwKa).toBeCloseTo(
      (BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2 * 100) / 1000,
      6,
    );
  });
});

describe('checkBusbarWithstand — adiabatic √t duration scaling', () => {
  it('raises Icw by √2 when the clearing time is halved', () => {
    const oneSecond = checkBusbarWithstand(200, 10, 1);
    const halfSecond = checkBusbarWithstand(200, 10, 0.5);
    // Result fields are rounded to 2 dp, so compare at 1 dp.
    expect(halfSecond.icwKa).toBeCloseTo(oneSecond.icwKa * Math.SQRT2, 1);
  });

  it('lets a fast (0.2 s) clearing time make a marginal bar adequate', () => {
    // 200 mm² → Icw(1 s) = 16 kA (just under 18 kA fault), but Icw(0.2 s)
    // = 16 / √0.2 ≈ 35.8 kA ≥ 18 kA.
    expect(checkBusbarWithstand(200, 18, 1).adequate).toBe(false);
    expect(checkBusbarWithstand(200, 18, 0.2).adequate).toBe(true);
  });

  it('defaults the duration to the 1-second Icw basis', () => {
    const r = checkBusbarWithstand(250, 10);
    expect(r.durationS).toBe(1);
  });
});

describe('checkBusbarWithstand — peak withstand (IEC 61439-1 Table 7)', () => {
  it('reports ipkKa = n · faultKa with n increasing as the fault level rises', () => {
    const low = checkBusbarWithstand(300, 4); // ≤ 5 kA band → n = 1.5
    const high = checkBusbarWithstand(300, 30); // 20–50 kA band → n = 2.1

    expect(low.peakFactor).toBe(peakFactor(4));
    expect(high.peakFactor).toBe(peakFactor(30));
    expect(high.peakFactor).toBeGreaterThan(low.peakFactor);

    expect(low.ipkKa).toBeCloseTo(low.peakFactor * 4, 6);
    expect(high.ipkKa).toBeCloseTo(high.peakFactor * 30, 6);
  });

  it('notes the out-of-scope mechanical support caveat and cites the clause', () => {
    const r = checkBusbarWithstand(300, 16);
    expect(r.note).toMatch(/support/i);
    expect(r.clause).toMatch(/61439-1/);
  });
});
