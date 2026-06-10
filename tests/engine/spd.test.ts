import { describe, it, expect } from 'vitest';
import { recommendSpd, type SpdSelectionInput } from '@shared/engine/spd';

function input(p: Partial<SpdSelectionInput> = {}): SpdSelectionInput {
  return {
    earthingSystem: 'TN-S',
    hasExternalLps: false,
    overheadSupply: false,
    atOrigin: true,
    ...p,
  };
}

describe('recommendSpd', () => {
  it('origin TN with no LPS / overhead exposure → Type 2 (no Iimp)', () => {
    const r = recommendSpd(input({ earthingSystem: 'TN-S' }));
    expect(r.recommended).toBe(true);
    expect(r.type).toBe('Type 2');
    expect(r.iimpKa).toBeUndefined();
    expect(r.inKa).toBe(20);
    expect(r.imaxKa).toBe(40);
    expect(r.location).toMatch(/origin/i);
  });

  it('origin with an external LPS → Type 1+2 with Iimp set (10/350 µs)', () => {
    const r = recommendSpd(input({ hasExternalLps: true }));
    expect(r.type).toBe('Type 1+2');
    expect(r.iimpKa).toBe(12.5);
    expect(r.iimpKa).toBeGreaterThanOrEqual(12.5);
    expect(r.note).toMatch(/lightning protection system/i);
  });

  it('overhead supply (no LPS) also forces a Type 1 device with Iimp', () => {
    const r = recommendSpd(input({ overheadSupply: true }));
    expect(r.type).toBe('Type 1+2');
    expect(r.iimpKa).toBeGreaterThanOrEqual(12.5);
    expect(r.note).toMatch(/overhead/i);
  });

  it('TT system → "3+1" connection with a higher N-PE Uc and 275 V L-N', () => {
    const r = recommendSpd(input({ earthingSystem: 'TT' }));
    expect(r.ucV).toBe(275);
    expect(r.npeUcV).toBeGreaterThan(r.ucV);
    expect(r.npeUcV).toBe(335);
    expect(r.connection).toMatch(/3\+1/);
    expect(r.connection).toMatch(/spark[- ]gap/i);
  });

  it('plain TN-S uses common-mode connection (no 3+1 N-PE module)', () => {
    const r = recommendSpd(input({ earthingSystem: 'TN-S' }));
    expect(r.npeUcV).toBeUndefined();
    expect(r.connection).toMatch(/common-mode/i);
  });

  it('sub-distribution → Type 2/3 coordinated downstream', () => {
    const r = recommendSpd(input({ atOrigin: false, hasExternalLps: true }));
    // Even with an LPS, a downstream board does not need the partial-lightning
    // Type 1 — the origin device handles it.
    expect(r.type).toBe('Type 2');
    expect(r.iimpKa).toBeUndefined();
    expect(r.location).toMatch(/sub-distribution/i);
    expect(r.note).toMatch(/type 3/i);
  });

  it('Up coordination is always ≤ 2.5 kV (cat II withstand)', () => {
    const cases: SpdSelectionInput[] = [
      input({ earthingSystem: 'TN-S' }),
      input({ earthingSystem: 'TN-C-S', hasExternalLps: true }),
      input({ earthingSystem: 'TT', overheadSupply: true }),
      input({ atOrigin: false }),
    ];
    for (const c of cases) {
      const r = recommendSpd(c);
      expect(r.upKvMax).toBeLessThanOrEqual(2.5);
      expect(r.upKv).toBeLessThanOrEqual(r.upKvMax);
      expect(['good', 'acceptable']).toContain(r.protectionRating);
    }
  });

  it('carries the governing clause references', () => {
    const r = recommendSpd(input());
    expect(r.clause).toMatch(/IEC 61643-11/);
    expect(r.clause).toMatch(/60364-5-534/);
  });
});
