import { describe, it, expect } from 'vitest';
import {
  assessGensetStart,
  type GensetMotor,
} from '@shared/engine/gensetTransient';

/** Helper: assess a single motor of given kW + starter on a genset rating. */
function single(gensetKva: number, kW: number, starterType?: string) {
  const motor: GensetMotor = { name: `M-${kW}`, kW, starterType };
  return assessGensetStart({ gensetKva, motors: [motor] });
}

describe('assessGensetStart', () => {
  it('flags a big DOL motor on a small genset as unacceptable and recommends a larger set', () => {
    const r = single(100, 37, 'DOL');

    // Deep dip, beyond the 25% momentary limit.
    expect(r.acceptable).toBe(false);
    expect(r.estimatedDipPct).toBeGreaterThan(25);

    // The recommendation must be a strictly larger genset that fixes the dip.
    expect(r.recommendedMinGensetKva).toBeGreaterThan(r.gensetKva);

    // Sanity: a genset at the recommended rating is actually acceptable.
    const fixed = single(r.recommendedMinGensetKva, 37, 'DOL');
    expect(fixed.acceptable).toBe(true);
    expect(fixed.estimatedDipPct).toBeLessThanOrEqual(25);
  });

  it('passes the same motor when started via VFD (much lower starting kVA)', () => {
    const dol = single(100, 37, 'DOL');
    const vfd = single(100, 37, 'VFD');

    expect(vfd.acceptable).toBe(true);
    expect(vfd.estimatedDipPct).toBeLessThan(dol.estimatedDipPct);
    expect(vfd.startingKva).toBeLessThan(dol.startingKva);
  });

  it('roughly halves the DOL dip with a star-delta starter', () => {
    const dol = single(100, 37, 'DOL');
    const sd = single(100, 37, 'STAR_DELTA');

    expect(sd.estimatedDipPct).toBeLessThan(dol.estimatedDipPct);
    // Star-delta inrush is ~⅓ of DOL, so the resulting dip sits in the lower half.
    expect(sd.estimatedDipPct).toBeLessThan(dol.estimatedDipPct / 2);
  });

  it('reports the largest motor as the limiting case across a fleet', () => {
    const r = assessGensetStart({
      gensetKva: 250,
      motors: [
        { name: 'small', kW: 5.5, starterType: 'DOL' },
        { name: 'biggest', kW: 45, starterType: 'DOL' },
        { name: 'medium', kW: 22, starterType: 'DOL' },
      ],
    });
    expect(r.limitingMotorName).toBe('biggest');
  });

  it('treats an unknown/loose starter string as DOL (worst case)', () => {
    const dol = single(100, 30, 'DOL');
    const unknown = single(100, 30, 'something-weird');
    expect(unknown.estimatedDipPct).toBeCloseTo(dol.estimatedDipPct, 6);
  });

  it('returns a trivially acceptable result with no motors', () => {
    const r = assessGensetStart({ gensetKva: 100, motors: [] });
    expect(r.acceptable).toBe(true);
    expect(r.estimatedDipPct).toBe(0);
    expect(r.startingKva).toBe(0);
    expect(r.recommendedMinGensetKva).toBe(0);
    expect(r.note).toBe('no motors');
    expect(r.limitingMotorName).toBeUndefined();
  });

  it('cites the genset transient clause on the result', () => {
    const r = single(200, 30, 'DOL');
    expect(r.clause).toContain('ISO 8528-5');
  });
});
