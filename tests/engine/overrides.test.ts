import { describe, it, expect } from 'vitest';
import { computePanel, selectBreaker } from '@shared/engine';
import type { CircuitInput, PanelInput } from '@shared/types';

function circuit(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 5000,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function panel(circuits: CircuitInput[]): PanelInput {
  return {
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
}

describe('manual breaker override', () => {
  it('selectBreaker honors the override verbatim and marks it', () => {
    const auto = selectBreaker({ designCurrentA: 8, loadKind: 'general' });
    expect(auto.overridden).toBeUndefined();
    const manual = selectBreaker({ designCurrentA: 8, loadKind: 'general', overrideA: 32 });
    expect(manual.ratingA).toBe(32);
    expect(manual.overridden).toBe(true);
    expect(manual.deviceClass).toBe('MCB');
    // A large override flips the frame class accordingly.
    expect(selectBreaker({ designCurrentA: 8, loadKind: 'general', overrideA: 250 }).deviceClass).toBe(
      'MCCB',
    );
  });

  it('an OVERSIZED override is honored and the cable auto-sizes to cover it', () => {
    // 5 kW @ 400 V 3ph ≈ 8.5 A → auto would pick a 10 A MCB / 2.5 mm².
    const r = computePanel(panel([circuit({ id: 'c1', name: 'Load', breakerOverrideA: 63 })]));
    const c = r.circuits[0]!;
    expect(c.breaker.ratingA).toBe(63);
    expect(c.breaker.overridden).toBe(true);
    // Iz ≥ In coordination still holds: the cable covers the 63 A override.
    expect(c.cable.deratedIzA).toBeGreaterThanOrEqual(63);
    // Honored, not silently corrected — and no undersize error for oversizing.
    expect(r.warnings.some((w) => w.code === 'breaker-override-undersized')).toBe(false);
  });

  it('an UNDERSIZED override is flagged as an error with a clear-override fix', () => {
    // 30 kW @ 400 V ≈ 51 A design current; a manual 16 A breaker nuisance-trips.
    const r = computePanel(
      panel([circuit({ id: 'c1', name: 'Big load', loadW: 30000, breakerOverrideA: 16 })]),
    );
    const c = r.circuits[0]!;
    expect(c.breaker.ratingA).toBe(16); // honored…
    const warn = r.warnings.find((w) => w.code === 'breaker-override-undersized');
    expect(warn).toBeDefined(); // …but flagged
    expect(warn?.severity).toBe('error');
    expect(warn?.fixes?.[0]?.action?.type).toBe('clear-breaker-override');
  });

  it('a pinned cable minimum marks the cable as overridden', () => {
    const r = computePanel(panel([circuit({ id: 'c1', name: 'Load', cableOverrideMm2: 16 })]));
    const c = r.circuits[0]!;
    expect(c.cable.csaMm2).toBeGreaterThanOrEqual(16);
    expect(c.cable.overridden).toBe(true);
    // Without an override the flag stays absent.
    const plain = computePanel(panel([circuit({ id: 'c2', name: 'Plain' })])).circuits[0]!;
    expect(plain.cable.overridden).toBeUndefined();
  });
});
