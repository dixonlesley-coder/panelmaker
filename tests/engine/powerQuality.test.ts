import { describe, it, expect } from 'vitest';
import { computePowerFactor, startingAnalysis, applyStarterTemplate } from '@shared/engine';
import type { CircuitInput, ProjectInput } from '@shared/types';

function projectWith(circuit: Partial<CircuitInput> & { id: string; name: string }): ProjectInput {
  const c: CircuitInput = {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...circuit,
  };
  return {
    id: 'P',
    name: 'B',
    panels: [
      {
        id: 'M',
        name: 'M',
        system: '3ph',
        voltageV: 400,
        ambientTempC: 30,
        installMethod: 'conduit',
        groupingCount: 1,
        diversityFactor: 1,
        sourceType: 'utility',
        circuits: [c],
      },
    ],
  };
}

describe('computePowerFactor / capacitor bank', () => {
  it('recommends a bank when PF is below the penalty threshold', () => {
    const r = computePowerFactor(projectWith({ id: 'l', name: 'L', loadW: 100000, cosPhi: 0.8 }));
    expect(r.existingPf).toBeCloseTo(0.8, 2);
    expect(r.needed).toBe(true);
    expect(r.requiredKvar).toBeGreaterThan(40);
    expect(r.requiredKvar).toBeLessThan(45);
    expect(r.bankKvar).toBe(50);
    expect(r.steps).toBeGreaterThan(0);
  });

  it('oversizes the bank for a hot ambient (IEC 60831 derating)', () => {
    // Same load at a rooftop 50°C must specify a bank at least as large as 30°C
    // (and bigger once it crosses a step), so the hot bank still delivers the
    // required compensation; the note records the derating.
    const bankAt = (ambientTempC: number) =>
      computePowerFactor({
        id: 'P', name: 'B',
        panels: [{
          id: 'M', name: 'M', system: '3ph', voltageV: 400, ambientTempC,
          installMethod: 'conduit', groupingCount: 1, diversityFactor: 1, sourceType: 'utility',
          circuits: [{ id: 'l', name: 'L', role: 'branch', loadW: 225000, cosPhi: 0.8, lengthM: 20, loadKind: 'general', isLighting: false, demandFactor: 1 }],
        }],
      });
    const cold = bankAt(30); // ~95 kvar → 100 kvar bank
    const hot = bankAt(50); // ~95/0.88 ≈ 108 kvar → 150 kvar bank
    expect(cold.note).not.toMatch(/ambient/);
    expect(hot.note).toMatch(/50°C/);
    expect(hot.bankKvar).toBeGreaterThan(cold.bankKvar);
  });

  it('no correction when PF is already good', () => {
    const r = computePowerFactor(projectWith({ id: 'l', name: 'L', loadW: 50000, cosPhi: 0.98 }));
    expect(r.needed).toBe(false);
    expect(r.bankKvar).toBe(0);
  });

  it('VSD-driven loads present near-unity PF (little reactive demand)', () => {
    const r = computePowerFactor(
      projectWith({ id: 'm', name: 'Pump', loadKind: 'pump', motorKw: 55, starterType: 'VFD', cosPhi: 0.8 }),
    );
    expect(r.existingPf).toBeGreaterThanOrEqual(0.94);
  });
});

describe('startingAnalysis (VSD / soft starter comparison)', () => {
  it('DOL: high inrush, full torque', () => {
    const s = startingAnalysis('DOL', 100);
    expect(s.startCurrentMultiple).toBe(6.5);
    expect(s.startCurrentA).toBe(650);
    expect(s.startTorquePct).toBe(100);
  });

  it('star-delta cuts inrush and torque', () => {
    const s = startingAnalysis('STAR_DELTA', 100);
    expect(s.startCurrentMultiple).toBeLessThan(3);
    expect(s.startTorquePct).toBeLessThan(40);
  });

  it('VSD: minimal inrush; energy-saving note on variable-torque loads', () => {
    const s = startingAnalysis('VFD', 100, true);
    expect(s.startCurrentMultiple).toBeLessThanOrEqual(1.5);
    expect(s.note).toMatch(/energy saving/i);
  });

  it('soft starter ramps the current', () => {
    expect(startingAnalysis('SOFT_STARTER', 100).note).toMatch(/ramp/i);
  });

  it('is attached to the sized control assembly', () => {
    const a = applyStarterTemplate({ circuitId: 'c', starterType: 'VFD', motorKw: 11, variableTorque: true });
    expect(a.starting?.method).toContain('VFD');
    expect(a.starting?.startCurrentMultiple).toBeLessThanOrEqual(1.5);
  });
});
