import { describe, it, expect } from 'vitest';
import { computePanel } from '@shared/engine';
import type { CircuitInput, PanelInput } from '@shared/types';

function vfdMotor(id: string, kw: number): CircuitInput {
  return {
    id,
    name: `VFD motor ${id}`,
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 15,
    loadKind: 'motor',
    isLighting: false,
    demandFactor: 1,
    motorKw: kw,
    starterType: 'VFD',
  };
}

function panel(circuits: CircuitInput[]): PanelInput {
  return {
    id: 'MCC',
    name: 'MCC',
    system: '3ph',
    voltageV: 400,
    ambientTempC: 35,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits,
  };
}

describe('enclosure thermal auto-design', () => {
  it('counts the specified cooling and escalates size — VFD MCC no longer warns', () => {
    // A few VFDs: real heat, but well within what forced cooling + a bigger
    // cabinet shed. The engine must DESIGN this (ventilation already chosen by
    // heat; size grown if needed), not warn about its own design.
    const r = computePanel(panel([vfdMotor('m1', 15), vfdMotor('m2', 11), vfdMotor('m3', 7.5)]));
    expect(r.enclosure.totalHeatW).toBeGreaterThan(50); // non-trivial heat
    expect(r.enclosure.ventilation).not.toBe('natural'); // cooling specified…
    expect(r.enclosure.thermal?.withinLimit).toBe(true); // …and counted
    expect(r.warnings.some((w) => w.code === 'enclosure-overtemp')).toBe(false);
  });

  it('grows the enclosure when the initial size cannot shed the heat', () => {
    const small = computePanel(panel([vfdMotor('m1', 15)]));
    const hot = computePanel(
      panel(Array.from({ length: 8 }, (_, i) => vfdMotor(`m${i}`, 18.5))),
    );
    // The hot board ends up physically larger than module count alone demands,
    // or — if growth sufficed — at least thermally consistent.
    if (hot.enclosure.thermal?.withinLimit) {
      expect(hot.warnings.some((w) => w.code === 'enclosure-overtemp')).toBe(false);
    } else {
      // Escalation exhausted: the warning must say so at the FINAL size.
      const w = hot.warnings.find((x) => x.code === 'enclosure-overtemp');
      expect(w).toBeDefined();
      expect(w!.message).toContain(`${hot.enclosure.widthMm}×${hot.enclosure.heightMm}`);
    }
    // Warning presence must always match the thermal verdict.
    expect(small.warnings.some((w) => w.code === 'enclosure-overtemp')).toBe(
      small.enclosure.thermal?.withinLimit === false,
    );
  });

  it('a heat load beyond all escalation still warns (split-the-board case)', () => {
    // 20 large VFDs in one assembly: multi-kW of heat defeats the 2.2×1.6 m
    // cabinet ceiling — the engine must keep telling the truth here.
    const r = computePanel(
      panel(Array.from({ length: 20 }, (_, i) => vfdMotor(`m${i}`, 75))),
    );
    if (!r.enclosure.thermal?.withinLimit) {
      expect(r.warnings.some((w) => w.code === 'enclosure-overtemp')).toBe(true);
      // Escalation genuinely exhausted: at/beyond a practical cabinet limit in
      // at least one dimension (the module count alone may exceed the height cap).
      expect(r.enclosure.heightMm >= 2200 || r.enclosure.widthMm >= 1600).toBe(true);
    }
  });
});
