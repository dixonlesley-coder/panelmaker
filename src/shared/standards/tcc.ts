/**
 * Time-current characteristic (TCC) envelopes for low-voltage protective devices,
 * used to draw coordination / discrimination curves on a log-log current-time plot.
 *
 * The curves are deterministic, pure approximations of the published tripping
 * envelopes — they are intended for *visual* coordination study (does breaker A
 * clear before breaker B for a given fault?), not for type-tested selectivity
 * verification, which must come from the manufacturer's discrimination tables.
 *
 * Standards basis:
 *   - MCB (IEC 60898-1): the thermal-magnetic tripping characteristic. Conventional
 *     non-tripping current 1.13·In and conventional tripping current 1.45·In, both
 *     referred to the conventional time (1 h for In ≤ 63 A). Instantaneous magnetic
 *     trip bands by curve: B 3–5·In, C 5–10·In, D 10–20·In.
 *   - MCCB (IEC 60947-2): an inverse-time thermal (long-time) region plus an
 *     instantaneous (short-circuit) trip, here taken at a representative ~10·In.
 *
 * No DOM/Node usage — pure TypeScript, safe in the shared engine.
 */

import type { BreakerClass, BreakerCurve } from './protection';

/**
 * One sampled point on a tripping boundary: the current `i` (amperes) and the
 * maximum time `t` (seconds) the device may take to clear at that current.
 */
export interface CurvePoint {
  /** Current through the device (amperes). */
  i: number;
  /** Trip / clearing time at that current (seconds). */
  t: number;
}

/**
 * A protective device described well enough to derive its trip curve: the device
 * class selects the inverse-time model, the curve letter selects the magnetic
 * band, and the rating fixes the In→amps mapping.
 */
export interface CurveDevice {
  /** Breaker family — selects the thermal model. */
  deviceClass: BreakerClass;
  /** Trip curve letter — selects the magnetic multiple (MCB) / short-time pickup. */
  curve: BreakerCurve;
  /** Rated current In (amperes); multiples below are scaled by this. */
  ratingA: number;
}

/**
 * Lower and upper magnetic trip multiples (×In) per IEC 60898-1 curve. The upper
 * bound is the guaranteed instantaneous trip multiple — at and above it the device
 * is in the magnetic region and clears quickly.
 */
export const MAGNETIC_BAND: Readonly<Record<BreakerCurve, { lo: number; hi: number }>> = {
  B: { lo: 3, hi: 5 },
  C: { lo: 5, hi: 10 },
  D: { lo: 10, hi: 20 },
};

/**
 * Conventional tripping multiple (×In) at which the thermal element is guaranteed
 * to trip within the conventional time. IEC 60898-1: 1.45·In.
 */
export const CONVENTIONAL_TRIP_MULTIPLE = 1.45;

/**
 * Conventional non-tripping multiple (×In). IEC 60898-1: the breaker must NOT trip
 * within the conventional time at 1.13·In, so this is the start of the curve.
 */
export const CONVENTIONAL_NONTRIP_MULTIPLE = 1.13;

/** Conventional time for the overload region (seconds). IEC 60898-1: 1 h for In ≤ 63 A. */
export const CONVENTIONAL_TIME_S = 3600;

/**
 * Representative instantaneous clearing time once the magnetic element has picked
 * up (seconds). Real devices clear in ~5–20 ms; 0.01 s is a clean, legible floor
 * on a log time axis.
 */
export const INSTANTANEOUS_CLEAR_S = 0.01;

/**
 * MCCB short-circuit (instantaneous) pickup multiple (×In). IEC 60947-2 instantaneous
 * settings are adjustable; a fixed ~10·In is a representative mid-setting used here
 * for the visual envelope.
 */
export const MCCB_INSTANTANEOUS_MULTIPLE = 10;

/**
 * Map a current multiple (×In) to the inverse-time clearing time (seconds) in the
 * thermal overload region, anchored on the two IEC conventional points:
 *   - at {@link CONVENTIONAL_TRIP_MULTIPLE} (1.45·In) → {@link CONVENTIONAL_TIME_S},
 *   - decaying smoothly toward {@link INSTANTANEOUS_CLEAR_S} as the multiple rises.
 *
 * Uses an inverse power law t = a / (m^k) so the curve is monotone decreasing in
 * the current multiple `m`, matching the qualitative shape of a thermal trip.
 * Purely a visualisation approximation, not the exact I²t characteristic.
 *
 * @param m current as a multiple of In (must be > 0)
 * @param magneticLo the magnetic pickup multiple where the thermal region ends
 */
function thermalTime(m: number, magneticLo: number): number {
  // Inverse power law anchored at (1.45 -> CONVENTIONAL_TIME_S) and decaying to
  // roughly INSTANTANEOUS_CLEAR_S at the magnetic pickup multiple.
  const m1 = CONVENTIONAL_TRIP_MULTIPLE;
  const t1 = CONVENTIONAL_TIME_S;
  const m2 = Math.max(magneticLo, m1 * 1.5);
  const t2 = Math.max(INSTANTANEOUS_CLEAR_S, 0.02);
  // Solve t = a * m^(-k) through the two anchor points (log-log straight line).
  const k = (Math.log(t1) - Math.log(t2)) / (Math.log(m2) - Math.log(m1));
  const a = t1 * Math.pow(m1, k);
  return a * Math.pow(m, -k);
}

/**
 * Sampled current multiples (×In) used to trace the thermal overload region. Dense
 * enough to read as a smooth curve on a log axis without being wasteful.
 */
const THERMAL_MULTIPLES: readonly number[] = [
  1.13, 1.2, 1.3, 1.45, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20,
];

/**
 * Build the maximum-clearing-time boundary for a device as an array of ascending
 * (current, time) points, in *amperes* and *seconds*. The boundary has two parts:
 *   1. the inverse-time thermal region from 1.13·In up to the magnetic pickup, and
 *   2. the magnetic / instantaneous region — a near-vertical drop to
 *      {@link INSTANTANEOUS_CLEAR_S} at and beyond the pickup multiple.
 *
 * The result is monotone non-increasing in time (higher current → faster trip), so
 * it can be drawn directly as a polyline. Points are deterministic.
 *
 * @throws never — non-finite or non-positive ratings yield an empty array.
 */
export function tripCurve(device: CurveDevice): CurvePoint[] {
  const In = device.ratingA;
  if (!Number.isFinite(In) || In <= 0) return [];

  const band = MAGNETIC_BAND[device.curve];
  // MCCBs pick up at the (fixed, representative) short-circuit multiple; MCBs use
  // the lower edge of their curve band as the start of the magnetic region.
  const pickup = device.deviceClass === 'MCCB' ? MCCB_INSTANTANEOUS_MULTIPLE : band.lo;

  const points: CurvePoint[] = [];

  // 1. Thermal overload region: only the multiples below the magnetic pickup.
  for (const m of THERMAL_MULTIPLES) {
    if (m >= pickup) break;
    points.push({ i: m * In, t: thermalTime(m, pickup) });
  }

  // 2. Magnetic / instantaneous region: a near-vertical step down at the pickup,
  //    then a short horizontal run at the instantaneous clearing time so the
  //    boundary reads clearly on the plot.
  const pickupTime = thermalTime(pickup, pickup);
  points.push({ i: pickup * In, t: Math.max(pickupTime, INSTANTANEOUS_CLEAR_S) });
  points.push({ i: pickup * In, t: INSTANTANEOUS_CLEAR_S });
  // Run out to the guaranteed instantaneous multiple (MCB) or a decade past pickup
  // (MCCB), holding the instantaneous clearing time.
  const topMultiple = device.deviceClass === 'MCCB' ? pickup * 5 : band.hi;
  points.push({ i: topMultiple * In, t: INSTANTANEOUS_CLEAR_S });

  return points;
}

/** Map a rating In to amperes for a multiple m: `amps(In, m) = In·m`. Trivial but explicit. */
export function ampsForMultiple(ratingA: number, multiple: number): number {
  return ratingA * multiple;
}
