import { describe, it, expect } from 'vitest';
import {
  inrushMultiple,
  transformerInrush,
  energisationSag,
  INRUSH_MULTIPLE_BY_KVA,
  INRUSH_TRANSIENT_SAG_LIMIT_PCT,
  INRUSH_DURATION_MS_APPROX,
} from '@shared/engine/transformerInrush';

describe('inrushMultiple', () => {
  it('bands by transformer size', () => {
    expect(inrushMultiple(50)).toBe(12); // small dry / distribution
    expect(inrushMultiple(100)).toBe(12); // boundary -> 12
    expect(inrushMultiple(200)).toBe(10);
    expect(inrushMultiple(630)).toBe(10); // boundary -> 10
    expect(inrushMultiple(1000)).toBe(8); // larger oil unit
  });

  it('table bands agree with the function', () => {
    for (const kva of [50, 100, 200, 630, 1000, 2000]) {
      const band = INRUSH_MULTIPLE_BY_KVA.find((b) => kva <= b.maxKva)!;
      expect(band.multiple).toBe(inrushMultiple(kva));
    }
  });
});

describe('transformerInrush', () => {
  it('200 kVA tx (~289 A secondary at 400 V) -> 10x, ~2890 A', () => {
    const ratedCurrentA = 289; // ~ 200 kVA / (sqrt(3) * 400 V)
    const r = transformerInrush({ ratedCurrentA, kva: 200 });
    expect(r.multiple).toBe(10);
    expect(r.inrushA).toBeCloseTo(2890, 0);
    expect(r.durationMsApprox).toBe(INRUSH_DURATION_MS_APPROX);
    expect(r.durationMsApprox).toBeGreaterThan(0);
  });

  it('clamps a negative rated current to zero inrush', () => {
    expect(transformerInrush({ ratedCurrentA: -5, kva: 200 }).inrushA).toBe(0);
  });
});

describe('energisationSag', () => {
  const inrushA = transformerInrush({ ratedCurrentA: 289, kva: 200 }).inrushA; // ~2890 A

  it('strong source (25 kA) -> modest sag (voltage-divider)', () => {
    // 2890 / (2890 + 25000) ~= 10.4 %
    const s = energisationSag({ inrushA, sourceFaultLevelA: 25000 });
    expect(s.sagPercent).toBeCloseTo(10.36, 1);
  });

  it('very strong source (100 kA) -> small sag, within limit', () => {
    // 2890 / (2890 + 100000) ~= 2.81 %
    const s = energisationSag({ inrushA, sourceFaultLevelA: 100000 });
    expect(s.sagPercent).toBeCloseTo(2.81, 1);
    expect(s.sagPercent).toBeLessThan(INRUSH_TRANSIENT_SAG_LIMIT_PCT);
    expect(s.withinTransientLimit).toBe(true);
  });

  it('weak source (5 kA) -> larger sag, over the transient limit', () => {
    // 2890 / (2890 + 5000) ~= 36.6 %
    const s = energisationSag({ inrushA, sourceFaultLevelA: 5000 });
    expect(s.sagPercent).toBeCloseTo(36.63, 1);
    expect(s.sagPercent).toBeGreaterThan(INRUSH_TRANSIENT_SAG_LIMIT_PCT);
    expect(s.withinTransientLimit).toBe(false);
  });

  it('a stronger source always gives a smaller sag', () => {
    const weak = energisationSag({ inrushA, sourceFaultLevelA: 5000 }).sagPercent;
    const strong = energisationSag({ inrushA, sourceFaultLevelA: 25000 }).sagPercent;
    expect(strong).toBeLessThan(weak);
  });

  it('handles a zero/degenerate source without NaN', () => {
    const s = energisationSag({ inrushA: 0, sourceFaultLevelA: 0 });
    expect(s.sagPercent).toBe(0);
    expect(s.withinTransientLimit).toBe(true);
  });
});
