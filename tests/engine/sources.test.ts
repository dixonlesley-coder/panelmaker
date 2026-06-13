import { describe, it, expect } from 'vitest';
import { sizeGenerator, sizeSolar, sizeBattery, computeSources } from '@shared/engine';

describe('generator sizing', () => {
  it('standby genset covers the backup fraction', () => {
    const g = sizeGenerator(160, { enabled: true, backupFraction: 1, mode: 'standby' });
    expect(g.backupKva).toBe(160);
    expect(g.ratingKva).toBe(200); // next standard >= 160
  });

  it('sizes genset fuel rate + day-tank for runtime', () => {
    // 160 kVA backup × 0.8 pf = 128 kW; ×0.25 l/kWh = 32 l/h; 8 h → 256 → 260 L.
    const g = sizeGenerator(160, { enabled: true, backupFraction: 1, mode: 'standby' });
    expect(g.fuelLph).toBeCloseTo(32, 0);
    expect(g.runtimeHours).toBe(8);
    expect(g.dayTankL).toBe(260);
    expect(g.note).toMatch(/day-tank/);
  });

  it('prime genset adds continuous-duty headroom', () => {
    const g = sizeGenerator(160, { enabled: true, backupFraction: 1, mode: 'prime' });
    expect(g.ratingKva).toBe(200); // 160 x 1.25 = 200
  });

  it('essential-only backup sizes smaller', () => {
    const g = sizeGenerator(160, { enabled: true, backupFraction: 0.5, mode: 'standby' });
    expect(g.backupKva).toBe(80);
    expect(g.ratingKva).toBe(82);
  });
});

describe('solar PV sizing', () => {
  it('sizes the array, inverter and string layout', () => {
    const s = sizeSolar({ enabled: true, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 });
    expect(s.panelCount).toBe(91); // ceil(50000 / 550)
    expect(s.arrayKwp).toBeCloseTo(50.05, 1);
    expect(s.inverterKw).toBe(50); // 50.05 / 1.2 = 41.7 -> 50
    expect(s.stringSize).toBeGreaterThan(0);
    expect(s.strings * s.stringSize).toBeGreaterThanOrEqual(s.panelCount);
    expect(s.dailyKwh).toBeGreaterThan(0);
  });
});

describe('battery sizing', () => {
  it('sizes a LiFePO4 bank for load x autonomy', () => {
    const b = sizeBattery({ enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' });
    expect(b.requiredKwh).toBeCloseTo(46.8, 0); // 10*4 / (0.9 DoD * 0.95 discharge eff)
    expect(b.moduleCount).toBe(10);
    expect(b.installedKwh).toBeCloseTo(51.2, 1);
    expect(b.inverterKw).toBe(10);
  });

  it('lead-acid needs more energy (lower usable DoD)', () => {
    const lfp = sizeBattery({ enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' });
    const pb = sizeBattery({ enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lead_acid' });
    expect(pb.requiredKwh).toBeGreaterThan(lfp.requiredKwh);
  });
});

describe('computeSources', () => {
  it('sizes only the enabled sources', () => {
    const r = computeSources(
      {
        generator: { enabled: true, backupFraction: 1, mode: 'standby' },
        solar: { enabled: false, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 },
        battery: { enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' },
      },
      100,
    );
    expect(r?.generator).toBeDefined();
    expect(r?.solar).toBeUndefined();
    expect(r?.battery).toBeDefined();
  });

  it('returns undefined without config', () => {
    expect(computeSources(undefined, 100)).toBeUndefined();
  });
});
