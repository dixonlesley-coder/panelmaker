import { describe, it, expect } from 'vitest';
import {
  groundTempFactor,
  depthFactor,
  GROUND_TEMP_FACTORS,
  GROUND_TEMP_FACTORS_XLPE,
  DEPTH_OF_LAYING_FACTORS,
} from '@shared/standards/groundDerating';

describe('groundTempFactor (IEC 60364-5-52 Table B.52.15, ground ref 20 °C)', () => {
  it('is 1.0 at the 20 °C reference for both insulations', () => {
    expect(groundTempFactor(20, 'PVC')).toBe(1.0);
    expect(groundTempFactor(20, 'XLPE')).toBe(1.0);
  });

  it('matches tabulated PVC points (35 °C ≈ 0.84, 40 °C ≈ 0.77)', () => {
    expect(groundTempFactor(35, 'PVC')).toBeCloseTo(0.84, 5);
    expect(groundTempFactor(40, 'PVC')).toBeCloseTo(0.77, 5);
  });

  it('matches tabulated XLPE points (35 °C ≈ 0.89) — XLPE derates more gently', () => {
    expect(groundTempFactor(35, 'XLPE')).toBeCloseTo(0.89, 5);
    expect(groundTempFactor(35, 'XLPE')).toBeGreaterThan(groundTempFactor(35, 'PVC'));
  });

  it('interpolates linearly between points (22.5 °C PVC = midpoint of 20→25)', () => {
    // (1.00 + 0.95) / 2 = 0.975
    expect(groundTempFactor(22.5, 'PVC')).toBeCloseTo(0.975, 5);
    // XLPE: (1.00 + 0.96) / 2 = 0.98
    expect(groundTempFactor(22.5, 'XLPE')).toBeCloseTo(0.98, 5);
  });

  it('clamps below 10 °C to the 10 °C value', () => {
    expect(groundTempFactor(5, 'PVC')).toBe(GROUND_TEMP_FACTORS[10]);
    expect(groundTempFactor(-10, 'PVC')).toBe(GROUND_TEMP_FACTORS[10]);
    expect(groundTempFactor(5, 'XLPE')).toBe(GROUND_TEMP_FACTORS_XLPE[10]);
  });

  it('clamps above 50 °C to the 50 °C value', () => {
    expect(groundTempFactor(60, 'PVC')).toBe(GROUND_TEMP_FACTORS[50]);
    expect(groundTempFactor(100, 'XLPE')).toBe(GROUND_TEMP_FACTORS_XLPE[50]);
  });
});

describe('depthFactor (IEC 60364-5-52 depth of laying, ref 0.5 m)', () => {
  it('is 1.0 at the 0.5 m reference depth', () => {
    expect(depthFactor(0.5)).toBe(1.0);
  });

  it('matches tabulated points (1.0 m = 0.95, 2.0 m = 0.92)', () => {
    expect(depthFactor(1.0)).toBeCloseTo(0.95, 5);
    expect(depthFactor(2.0)).toBeCloseTo(0.92, 5);
  });

  it('interpolates between depths (0.7 m = midpoint of 0.6→0.8)', () => {
    // (0.98 + 0.96) / 2 = 0.97
    expect(depthFactor(0.7)).toBeCloseTo(0.97, 5);
  });

  it('clamps below 0.5 m to the 0.5 m value', () => {
    expect(depthFactor(0.3)).toBe(DEPTH_OF_LAYING_FACTORS[0.5]);
    expect(depthFactor(0)).toBe(DEPTH_OF_LAYING_FACTORS[0.5]);
  });

  it('clamps above 2.0 m to the 2.0 m value', () => {
    expect(depthFactor(3)).toBe(DEPTH_OF_LAYING_FACTORS[2.0]);
  });
});
