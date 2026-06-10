import { describe, it, expect } from 'vitest';
import {
  motorFLC,
  selectContactor,
  selectOverload,
  sizeControlTransformer,
  selectVFD,
  applyStarterTemplate,
  applyPumpControl,
  validateInterlocks,
} from '@shared/engine';

describe('motorFLC', () => {
  it('matches the standard table at exact ratings', () => {
    expect(motorFLC(11)).toBeCloseTo(22, 1);
    expect(motorFLC(22)).toBeCloseTo(42, 1);
    expect(motorFLC(37)).toBeCloseTo(68, 1);
    expect(motorFLC(7.5)).toBeCloseTo(15.5, 1);
  });
  it('interpolates between ratings', () => {
    // between 7.5 kW (15.5 A) and 11 kW (22 A)
    expect(motorFLC(9)).toBeCloseTo(18.3, 1);
  });
});

describe('selectContactor (IEC 60947 AC-3)', () => {
  it('sizes to the next AC-3 frame', () => {
    const s = selectContactor({ flcA: 61 }); // 22 kW
    expect(s.ac3A).toBe(65);
    expect(s.ok).toBe(true);
  });
  it('applies the star-delta 58% winding rule', () => {
    const s = selectContactor({ flcA: 61, isStarWinding: true });
    expect(s.targetA).toBeCloseTo(35.4, 1);
    expect(s.ac3A).toBe(40);
  });
  it('derates heavily for AC-4 jogging duty', () => {
    const s = selectContactor({ flcA: 20, startingDuty: 'jogging' });
    // 20 / 0.25 = 80 A required AC-3
    expect(s.ac3A).toBe(80);
  });
});

describe('selectOverload', () => {
  it('sets the dial to FLC with class 10 by default', () => {
    const o = selectOverload({ flcA: 61 });
    expect(o.settingA).toBeCloseTo(61, 1);
    expect(o.tripClass).toBe('10');
  });
  it('uses the delta-leg current in a star-delta starter', () => {
    const o = selectOverload({ flcA: 61, inStarLeg: true });
    expect(o.settingA).toBeCloseTo(35.4, 1);
  });
  it('selects a higher trip class for heavy starting', () => {
    expect(selectOverload({ flcA: 30, startingDuty: 'heavy' }).tripClass).toBe('20');
  });
});

describe('sizeControlTransformer', () => {
  it('combines sealed + inrush VA and rounds up to a standard rating', () => {
    const tx = sizeControlTransformer({
      burdens: [
        { sealedVA: 7, inrushVA: 40 },
        { sealedVA: 7, inrushVA: 40 },
        { sealedVA: 7, inrushVA: 40 },
      ],
      pilotSealedVA: 10,
    });
    expect(tx.chosenVA).toBe(150);
    expect(tx.ok).toBe(true);
  });
});

describe('selectVFD', () => {
  it('sizes a drive by output current over motor FLC', () => {
    const v = selectVFD({ flcA: 20 }); // ~7.5 kW motor
    expect(v.outputA).toBeGreaterThanOrEqual(20 * 1.1);
    expect(v.ratedKw).toBe(11);
    expect(v.heatLossW).toBeGreaterThan(0);
  });
  it('bumps one frame for constant-torque duty', () => {
    const vt = selectVFD({ flcA: 20, torqueType: 'variable' });
    const ct = selectVFD({ flcA: 20, torqueType: 'constant' });
    expect(ct.outputA).toBeGreaterThan(vt.outputA);
  });
});

describe('applyStarterTemplate', () => {
  it('builds a DOL assembly', () => {
    const a = applyStarterTemplate({ circuitId: 'c1', starterType: 'DOL', motorKw: 5.5 });
    expect(a.motor?.flcA).toBeCloseTo(11.5, 1);
    const main = a.devices.find((d) => d.role === 'main-contactor');
    expect(main?.rating).toContain('12 A'); // FLC 11.5 -> 12 A frame
    expect(a.interlocks).toHaveLength(0);
  });

  it('builds a star-delta assembly with correctly sized contactors and interlocks', () => {
    const a = applyStarterTemplate({ circuitId: 'c2', starterType: 'STAR_DELTA', motorKw: 37 });
    const main = a.devices.find((d) => d.role === 'main-contactor');
    const star = a.devices.find((d) => d.role === 'star-contactor');
    const delta = a.devices.find((d) => d.role === 'delta-contactor');
    expect(main?.rating).toContain('80 A'); // FLC 68 -> 80 A frame
    expect(star?.rating).toContain('40 A'); // 68 * 0.58 = 39.4 -> 40 A
    expect(delta?.rating).toContain('80 A');
    // control transformer present
    expect(a.devices.some((d) => d.category === 'control_transformer')).toBe(true);
    // mechanical + electrical star<->delta interlocks
    expect(a.interlocks).toHaveLength(2);
    expect(validateInterlocks(a)).toHaveLength(0);
  });

  it('flags a starter missing its required interlock', () => {
    const a = applyStarterTemplate({ circuitId: 'c3', starterType: 'REVERSING', motorKw: 4 });
    const stripped = { ...a, interlocks: [] };
    const w = validateInterlocks(stripped);
    expect(w).toHaveLength(1);
    expect(w[0]?.code).toBe('missing-interlock');
  });
});

describe('applyPumpControl', () => {
  it('adds level sensing and pump config to a starter assembly', () => {
    const base = applyStarterTemplate({ circuitId: 'p1', starterType: 'DOL', motorKw: 3 });
    const pump = applyPumpControl(base, 'fill');
    expect(pump.pump?.mode).toBe('fill');
    expect(pump.devices.length).toBeGreaterThan(base.devices.length);
    expect(pump.devices.some((d) => d.category === 'level_relay')).toBe(true);
  });
});
