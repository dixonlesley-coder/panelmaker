/**
 * Tests for the time-current coordination (TCC) curve builder and the underlying
 * IEC 60898-1 / IEC 60947-2 trip-curve envelope sampler.
 *
 * Numerical assertions exercise `tripCurve` directly (deterministic points), while
 * structural assertions confirm `buildTccSvg` emits a well-formed, self-contained
 * SVG with the expected labels, curves and optional fault marker.
 */

import { describe, expect, it } from 'vitest';
import { buildTccSvg, type TccDevice } from '@shared/drawing/tccCurve';
import { tripCurve, type CurveDevice } from '@shared/standards/tcc';

const devC100: TccDevice = { label: 'Q1 C100', deviceClass: 'MCCB', curve: 'C', ratingA: 100 };
const devC16: TccDevice = { label: 'F2 C16', deviceClass: 'MCB', curve: 'C', ratingA: 16 };

/** Smallest time among curve points at or above a given current (A). */
function timeNear(curve: { i: number; t: number }[], amps: number): number {
  const at = curve.filter((p) => p.i <= amps);
  return at.length > 0 ? Math.min(...at.map((p) => p.t)) : curve[0]!.t;
}

describe('tripCurve (IEC 60898-1 / 60947-2 envelopes)', () => {
  it('returns ascending-current sampled points for a valid device', () => {
    const c: CurveDevice = { deviceClass: 'MCB', curve: 'C', ratingA: 16 };
    const pts = tripCurve(c);
    expect(pts.length).toBeGreaterThan(3);
    for (let k = 1; k < pts.length; k++) {
      expect(pts[k]!.i).toBeGreaterThanOrEqual(pts[k - 1]!.i);
    }
  });

  it('is inverse: trip time decreases as current increases', () => {
    const pts = tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: 16 });
    // The first (lowest-current) point must be the slowest, the last the fastest.
    expect(pts[0]!.t).toBeGreaterThan(pts[pts.length - 1]!.t);
    // Monotone non-increasing in time across the whole boundary.
    for (let k = 1; k < pts.length; k++) {
      expect(pts[k]!.t).toBeLessThanOrEqual(pts[k - 1]!.t + 1e-9);
    }
  });

  it('starts at the conventional non-trip point (1.13·In) with a long time', () => {
    const In = 16;
    const pts = tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: In });
    expect(pts[0]!.i).toBeCloseTo(1.13 * In, 5);
    // Overload region near the conventional point should be on the order of the
    // conventional time (1 h), i.e. very slow.
    expect(pts[0]!.t).toBeGreaterThan(100);
  });

  it('clears fast (~instantaneous) in the magnetic region', () => {
    const pts = tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: 16 });
    expect(pts[pts.length - 1]!.t).toBeLessThanOrEqual(0.02);
  });

  it('a higher-rated breaker sits to the right (more amps at a given time)', () => {
    const lo = tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: 16 });
    const hi = tripCurve({ deviceClass: 'MCCB', curve: 'C', ratingA: 100 });
    // At the long-time end, the higher-rated device carries more current before
    // tripping (its curve is shifted right along the current axis).
    expect(hi[0]!.i).toBeGreaterThan(lo[0]!.i);
    // And at a representative current that trips the small breaker fast (~160 A),
    // the larger breaker is still in its slow thermal region (more time).
    const probe = 160;
    expect(timeNear(hi, probe)).toBeGreaterThan(timeNear(lo, probe));
  });

  it('guards non-positive / non-finite ratings with an empty curve', () => {
    expect(tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: 0 })).toEqual([]);
    expect(tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: -5 })).toEqual([]);
    expect(tripCurve({ deviceClass: 'MCB', curve: 'C', ratingA: Number.NaN })).toEqual([]);
  });
});

describe('buildTccSvg', () => {
  it('returns a complete, self-contained SVG document', () => {
    const svg = buildTccSvg({ devices: [devC100, devC16] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox=');
  });

  it('includes each device label', () => {
    const svg = buildTccSvg({ devices: [devC100, devC16] });
    expect(svg).toContain('Q1 C100');
    expect(svg).toContain('F2 C16');
  });

  it('renders a trip-curve polyline per device', () => {
    const svg = buildTccSvg({ devices: [devC100, devC16] });
    const count = (svg.match(/<polyline /g) ?? []).length;
    expect(count).toBe(2);
  });

  it('draws the prospective-fault line only when faultA is given and positive', () => {
    const withFault = buildTccSvg({ devices: [devC100], faultA: 6000 });
    expect(withFault).toContain('stroke-dasharray');
    expect(withFault).toContain('Ik');

    const noFault = buildTccSvg({ devices: [devC100] });
    expect(noFault).not.toContain('Ik');

    // Non-positive fault is guarded out.
    const zeroFault = buildTccSvg({ devices: [devC100], faultA: 0 });
    expect(zeroFault).not.toContain('Ik');
  });

  it('produces valid axes even with no devices', () => {
    const svg = buildTccSvg({ devices: [] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Current (A)');
    expect(svg).toContain('Time (s)');
  });
});
