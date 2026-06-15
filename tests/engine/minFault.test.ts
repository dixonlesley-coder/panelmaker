import { describe, it, expect } from 'vitest';
import {
  instantaneousTrips,
  magneticTripThresholdA,
  minLineNeutralFaultA,
  phaseWithstand,
} from '@shared/engine/minFault';

describe('magneticTripThresholdA', () => {
  it('uses the IEC 60898 instantaneous multiples per curve', () => {
    expect(magneticTripThresholdA({ ratingA: 16, curve: 'B' })).toBe(80); // 5×
    expect(magneticTripThresholdA({ ratingA: 16, curve: 'C' })).toBe(160); // 10×
    expect(magneticTripThresholdA({ ratingA: 16, curve: 'D' })).toBe(320); // 20×
  });
});

describe('minLineNeutralFaultA', () => {
  it('a short 1.5 mm² run gives a high min fault that trips a 16 A type-C MCB', () => {
    // 1.5 mm² Cu, 5 m run: loop R ≈ 0.145 Ω ⇒ I ≈ 1.6 kA, far above the 160 A
    // type-C instantaneous threshold.
    const minFaultA = minLineNeutralFaultA({ u0V: 230, csaMm2: 1.5, lengthM: 5 });
    expect(minFaultA).toBeGreaterThan(160);
    expect(minFaultA).toBeGreaterThan(1000);
    expect(instantaneousTrips(minFaultA, { ratingA: 16, curve: 'C' })).toBe(true);
  });

  it('a very long thin run gives a low min fault that does NOT reach the type-C threshold', () => {
    // 1.5 mm² Cu, 200 m run: loop R ≈ 5.8 Ω ⇒ I ≈ 40 A, below the 160 A threshold.
    const minFaultA = minLineNeutralFaultA({ u0V: 230, csaMm2: 1.5, lengthM: 200 });
    expect(minFaultA).toBeLessThan(160);
    expect(instantaneousTrips(minFaultA, { ratingA: 16, curve: 'C' })).toBe(false);
  });

  it('defaults U0 to 230 V and divides the loop R across parallel runs', () => {
    const single = minLineNeutralFaultA({ u0V: 0, csaMm2: 16, lengthM: 50 });
    const doubled = minLineNeutralFaultA({ u0V: 0, csaMm2: 16, lengthM: 50, runsPerPhase: 2 });
    expect(single).toBeGreaterThan(0);
    // Halving the loop impedance roughly doubles the available fault current.
    expect(doubled).toBeGreaterThan(single);
  });

  it('a non-zero source impedance lowers the available fault current', () => {
    const noSource = minLineNeutralFaultA({ u0V: 230, csaMm2: 1.5, lengthM: 5 });
    const withSource = minLineNeutralFaultA({
      u0V: 230,
      csaMm2: 1.5,
      lengthM: 5,
      sourceZOhm: 0.2,
    });
    expect(withSource).toBeLessThan(noSource);
  });
});

describe('phaseWithstand', () => {
  it('4 mm² Cu/PVC at 6 kA cleared instantaneously is within the adiabatic limit', () => {
    // maxTimeS = (115·4 / 6000)² ≈ 0.0059 s; an instantaneous MCB clears faster.
    const w = phaseWithstand({
      faultA: 6000,
      clearingTimeS: 0.005,
      csaMm2: 4,
      material: 'Cu',
      insulation: 'PVC',
    });
    expect(w.maxTimeS).toBeGreaterThan(0.005);
    expect(w.ok).toBe(true);
  });

  it('a tiny 1.5 mm² conductor at a high fault with a long clearing time fails', () => {
    // maxTimeS = (115·1.5 / 10000)² ≈ 0.0003 s ≪ 0.1 s clearing time.
    const w = phaseWithstand({
      faultA: 10000,
      clearingTimeS: 0.1,
      csaMm2: 1.5,
      material: 'Cu',
      insulation: 'PVC',
    });
    expect(w.maxTimeS).toBeLessThan(0.1);
    expect(w.ok).toBe(false);
  });

  it('treats a zero fault current as harmless (no thermal stress)', () => {
    const w = phaseWithstand({ faultA: 0, clearingTimeS: 0.1, csaMm2: 1.5 });
    expect(w.ok).toBe(true);
  });
});
