import { describe, it, expect } from 'vitest';
import {
  loadCurrent,
  selectBreaker,
  sizeCable,
  voltageDrop,
  sizeBusbar,
  estimateEnclosure,
  deratingFactor,
} from '@shared/engine';
import { baseKha } from '@shared/standards';

describe('loadCurrent', () => {
  it('single-phase resistive load', () => {
    expect(loadCurrent({ powerW: 2200, voltageV: 220, cosPhi: 1, system: '1ph' })).toBeCloseTo(10, 3);
  });
  it('three-phase load', () => {
    // 22 kW at 400 V, pf 0.85 -> ~37.4 A
    expect(loadCurrent({ powerW: 22000, voltageV: 400, cosPhi: 0.85, system: '3ph' })).toBeCloseTo(37.36, 1);
  });
});

describe('selectBreaker', () => {
  it('picks the smallest standard rating >= Ib', () => {
    expect(selectBreaker({ designCurrentA: 8, loadKind: 'general' }).ratingA).toBe(10);
    expect(selectBreaker({ designCurrentA: 10, loadKind: 'general' }).ratingA).toBe(10);
    expect(selectBreaker({ designCurrentA: 11, loadKind: 'general' }).ratingA).toBe(16);
    expect(selectBreaker({ designCurrentA: 28, loadKind: 'general' }).ratingA).toBe(32);
    expect(selectBreaker({ designCurrentA: 51, loadKind: 'general' }).ratingA).toBe(63);
  });
  it('returns MCCB class above 63 A', () => {
    const b = selectBreaker({ designCurrentA: 70, loadKind: 'general' });
    expect(b.ratingA).toBe(80);
    expect(b.deviceClass).toBe('MCCB');
  });
  it('chooses trip curve by load kind', () => {
    expect(selectBreaker({ designCurrentA: 10, loadKind: 'lighting' }).curve).toBe('B');
    expect(selectBreaker({ designCurrentA: 10, loadKind: 'motor' }).curve).toBe('D');
    expect(selectBreaker({ designCurrentA: 10, loadKind: 'general' }).curve).toBe('C');
  });
});

describe('sizeCable (PUIL Iz >= max(In, 1.25*Ib))', () => {
  it('small final circuit picks the 2.5 mm^2 minimum', () => {
    const r = sizeCable({ designCurrentA: 8, breakerRatingA: 10, deratingFactor: 1, minSectionMm2: 2.5 });
    expect(r.csaMm2).toBe(2.5);
  });
  it('upsizes for higher current', () => {
    const r = sizeCable({ designCurrentA: 40, breakerRatingA: 50, deratingFactor: 1, minSectionMm2: 2.5 });
    // Iz required = 50 A -> 10 mm^2 (KHA 57)
    expect(r.csaMm2).toBe(10);
  });
  it('derating forces a larger section', () => {
    const r = sizeCable({ designCurrentA: 40, breakerRatingA: 50, deratingFactor: 0.7, minSectionMm2: 2.5 });
    // 10 mm^2 derated = 57*0.7 = 39.9 < 50 -> 16 mm^2 (76*0.7 = 53.2)
    expect(r.csaMm2).toBe(16);
  });
});

describe('breaker/cable coordination (In <= Iz always holds)', () => {
  it('every chosen breaker is covered by its cable ampacity', () => {
    for (let p = 500; p <= 150000; p += 500) {
      const ib = loadCurrent({ powerW: p, voltageV: 400, cosPhi: 0.85, system: '3ph' });
      const breaker = selectBreaker({ designCurrentA: ib, loadKind: 'general' });
      const cable = sizeCable({
        designCurrentA: ib,
        breakerRatingA: breaker.ratingA,
        deratingFactor: 1,
        minSectionMm2: 2.5,
      });
      if (!cable.appliedRule.startsWith('exceeds-range')) {
        expect(breaker.ratingA).toBeLessThanOrEqual(cable.deratedIzA + 1e-6);
      }
    }
  });

  it('PUIL worked-example pairings are validly protected', () => {
    // cable -> typical protecting MCB (In must not exceed cable KHA)
    expect(10).toBeLessThanOrEqual(baseKha(2.5)); // 2.5 mm^2 <-> 10 A
    expect(32).toBeLessThanOrEqual(baseKha(10)); // 10 mm^2 <-> 32 A
    expect(63).toBeLessThanOrEqual(baseKha(16)); // 16 mm^2 <-> 63 A
  });
});

describe('voltageDrop', () => {
  it('computes a realistic in-limit drop', () => {
    const r = voltageDrop({
      currentA: 100,
      lengthM: 50,
      csaMm2: 50,
      cosPhi: 0.85,
      system: '3ph',
      voltageV: 400,
      isLighting: false,
    });
    expect(r.dropPercent).toBeGreaterThan(0.5);
    expect(r.dropPercent).toBeLessThan(1.5);
    expect(r.withinLimit).toBe(true);
  });
  it('flags an excessive drop on a long thin run', () => {
    const r = voltageDrop({
      currentA: 40,
      lengthM: 120,
      csaMm2: 4,
      cosPhi: 0.85,
      system: '3ph',
      voltageV: 400,
      isLighting: false,
    });
    expect(r.withinLimit).toBe(false);
  });
  it('uses the 3% limit for lighting', () => {
    const r = voltageDrop({
      currentA: 10,
      lengthM: 10,
      csaMm2: 1.5,
      cosPhi: 1,
      system: '1ph',
      voltageV: 220,
      isLighting: true,
    });
    expect(r.limitPercent).toBe(3);
  });
});

describe('sizeBusbar', () => {
  it('picks the smallest bar covering the current', () => {
    const r = sizeBusbar(200);
    expect(r.ampacityA).toBeGreaterThanOrEqual(200);
    expect(r.csaMm2).toBe(60); // 20x3
  });
  it('moves up for higher current', () => {
    const r = sizeBusbar(1000);
    expect(r.ampacityA).toBeGreaterThanOrEqual(1000);
  });
});

describe('estimateEnclosure', () => {
  it('sizes a small panel with natural ventilation', () => {
    const r = estimateEnclosure({ modules: 20, totalHeatW: 30 });
    expect(r.rows).toBe(1);
    expect(r.ventilation).toBe('natural');
    expect(r.sheetThicknessMm).toBeGreaterThan(0);
  });
  it('requires forced cooling for high heat', () => {
    const r = estimateEnclosure({ modules: 60, totalHeatW: 350, hasFloorGear: true });
    expect(r.rows).toBeGreaterThan(1);
    expect(r.ventilation).toBe('forced');
    expect(r.depthMm).toBe(400);
  });
});

describe('deratingFactor', () => {
  it('is 1.0 at reference conditions', () => {
    expect(deratingFactor({ ambientC: 30, groupingCount: 1, installMethod: 'conduit' })).toBeCloseTo(1, 3);
  });
  it('reduces with heat and grouping', () => {
    const f = deratingFactor({ ambientC: 40, groupingCount: 3, installMethod: 'conduit' });
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(0.87 * 0.7, 2);
  });
});
