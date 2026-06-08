import { describe, it, expect } from 'vitest';
import { computeLoadProfile } from '@shared/engine';
import { hourlyFactors, presetKeyFor } from '@shared/standards';
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

function project(circuits: CircuitInput[]): ProjectInput {
  const panel: PanelInput = {
    id: 'P',
    name: 'DB',
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits,
  };
  return { id: 'PRJ', name: 'Test', panels: [panel] };
}

describe('hourlyFactors', () => {
  it('continuous is all-on', () => {
    expect(hourlyFactors()).toEqual(new Array(24).fill(1));
  });
  it('daytime window', () => {
    const f = hourlyFactors({ startHour: 9, endHour: 17 });
    expect(f[8]).toBe(0);
    expect(f[9]).toBe(1);
    expect(f[16]).toBe(1);
    expect(f[17]).toBe(0);
  });
  it('overnight window wraps past midnight', () => {
    const f = hourlyFactors({ startHour: 22, endHour: 6 });
    expect(f[23]).toBe(1);
    expect(f[0]).toBe(1);
    expect(f[5]).toBe(1);
    expect(f[6]).toBe(0);
    expect(f[12]).toBe(0);
  });
  it('resolves preset keys', () => {
    expect(presetKeyFor()).toBe('continuous');
    expect(presetKeyFor({ startHour: 22, endHour: 6 })).toBe('overnight');
    expect(presetKeyFor({ startHour: 3, endHour: 4 })).toBe('custom');
  });
});

describe('computeLoadProfile', () => {
  it('builds the 24h curve, peak and contributors from schedules', () => {
    const r = computeLoadProfile(
      project([
        branch({ id: 'c1', name: 'Servers (continuous)', loadW: 10000 }),
        branch({ id: 'c2', name: 'AC', loadKind: 'hvac', loadW: 10000, schedule: { startHour: 9, endHour: 17 } }),
        branch({
          id: 'c3',
          name: 'EV charger',
          loadKind: 'ev_charger',
          loadW: 10000,
          schedule: { startHour: 22, endHour: 6 },
        }),
      ]),
    );

    expect(r.hourlyKw).toHaveLength(24);
    expect(r.peakKw).toBe(20); // continuous 10 + (EV or AC) 10
    expect(r.hourlyKw[12]).toBe(20); // midday: servers + AC
    expect(r.hourlyKw[6]).toBe(10); // 06:00: only servers
    expect(r.dailyKwh).toBe(400); // 240 servers + 80 AC + 80 EV
    expect(r.loadFactor).toBe(0.83);

    // the peak hour is driven by two 10 kW loads
    expect(r.peakContributors).toHaveLength(2);
    expect(r.peakContributors.every((c) => c.kw === 10)).toBe(true);
  });
});
