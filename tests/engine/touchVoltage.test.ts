import { describe, expect, it } from 'vitest';

import {
  TOUCH_VOLTAGE_LIMIT_V,
  touchVoltageTT,
} from '@shared/engine/touchVoltage';

describe('touchVoltageTT (IEC 60364-4-41 §411.5.3, RA·IΔn ≤ 50 V)', () => {
  it('exposes the 50 V conventional limit', () => {
    expect(TOUCH_VOLTAGE_LIMIT_V).toBe(50);
  });

  it('RA=100 Ω with a 30 mA RCD → 3 V touch, ok', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 100, rcdRatingMa: 30 });
    expect(r.touchVoltageV).toBeCloseTo(3, 6);
    expect(r.limitV).toBe(50);
    expect(r.ok).toBe(true);
  });

  it('RA=100 Ω with a 300 mA RCD → 30 V touch, ok', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 100, rcdRatingMa: 300 });
    expect(r.touchVoltageV).toBeCloseTo(30, 6);
    expect(r.ok).toBe(true);
  });

  it('RA=200 Ω with a 300 mA RCD → 60 V touch, NOT ok', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 200, rcdRatingMa: 300 });
    expect(r.touchVoltageV).toBeCloseTo(60, 6);
    expect(r.ok).toBe(false);
  });

  it('maxElectrodeOhm ≈ 1667 Ω for a 30 mA RCD', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 5, rcdRatingMa: 30 });
    expect(r.maxElectrodeOhm).toBeCloseTo(1666.67, 1);
  });

  it('maxElectrodeOhm ≈ 167 Ω for a 300 mA RCD', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 5, rcdRatingMa: 300 });
    expect(r.maxElectrodeOhm).toBeCloseTo(166.67, 1);
  });

  it('an electrode exactly at the limit (RA=100 Ω, 500 mA → 50 V) is ok', () => {
    const r = touchVoltageTT({ electrodeResistanceOhm: 100, rcdRatingMa: 500 });
    expect(r.touchVoltageV).toBe(50);
    expect(r.ok).toBe(true);
    expect(r.maxElectrodeOhm).toBe(100);
  });
});
