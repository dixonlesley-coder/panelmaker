/**
 * Harmonics / power-quality reference data for non-linear (electronically
 * switched) loads, stamped with STANDARDS_VERSION.
 *
 * Non-linear loads — VFDs/VSDs, soft-starters, UPS, switch-mode/6-pulse
 * rectifier front-ends — draw distorted current that injects harmonic currents
 * onto the panel. The two consequences this module estimates:
 *   - Triplen harmonics (3rd, 9th, ...) on single-phase non-linear loads add
 *     arithmetically in the shared neutral, so a 3-phase, 4-wire feeder serving
 *     mostly single-phase non-linear load can see neutral current up to ~1.73×
 *     phase current. IEC 60364-5-52 §523.6.3 / Annex E require the neutral to be
 *     sized for that current (full-size, or oversized).
 *   - 3-phase 6-pulse VFDs largely cancel triplens line-to-line but leave the
 *     characteristic 5th/7th harmonics; mitigation is an input line reactor
 *     (3–5 % impedance) and/or a harmonic filter when the non-linear share of the
 *     panel is large.
 *
 * References: IEC 60364-5-52 (neutral sizing for harmonics), IEC 61000-2-4 /
 * IEEE 519 (THD compatibility levels). The thresholds below are defensible
 * design rules of thumb, not a substitute for a measured power-quality survey.
 */

/**
 * Non-linear load fraction (of panel demand) above which the characteristic
 * 5th/7th harmonics of 3-phase 6-pulse drives warrant an input line reactor.
 */
export const REACTOR_FRACTION_THRESHOLD = 0.35;

/**
 * Non-linear fraction above which a harmonic filter (passive trap or active
 * filter) is recommended in addition to drive-level line reactors.
 */
export const FILTER_FRACTION_THRESHOLD = 0.6;

/** Typical input line-reactor impedance recommended for 6-pulse drives (% Z). */
export const RECOMMENDED_REACTOR_PCT_Z = 3;

/**
 * Single-phase non-linear fraction above which triplen harmonics dominate the
 * neutral and a full-size (or oversized) neutral is required.
 */
export const NEUTRAL_OVERSIZE_FRACTION_THRESHOLD = 0.33;

/**
 * Neutral-current multiplier of phase current as a function of the triplen
 * (single-phase non-linear) load share. At 100 % single-phase non-linear load
 * the third-harmonic neutral current approaches sqrt(3) ≈ 1.73× the phase
 * current (IEC 60364-5-52 Annex E); we scale linearly with the share and clamp
 * to the [1.0, 1.73] band. Below the oversize threshold the standard reduced
 * neutral remains acceptable, so the factor is reported as 1.0.
 */
export const TRIPLEN_NEUTRAL_PEAK_FACTOR = 1.73;

/**
 * Neutral oversize multiplier (of phase current) for a given single-phase
 * non-linear share (0–1). Linear ramp from 1.0 at the threshold up to the
 * triplen peak factor at 100 % non-linear load.
 */
export function neutralOversizeFactor(singlePhaseNonLinearFraction: number): number {
  const f = Math.min(1, Math.max(0, singlePhaseNonLinearFraction));
  if (f < NEUTRAL_OVERSIZE_FRACTION_THRESHOLD) return 1;
  const span = 1 - NEUTRAL_OVERSIZE_FRACTION_THRESHOLD;
  const t = span > 0 ? (f - NEUTRAL_OVERSIZE_FRACTION_THRESHOLD) / span : 1;
  return 1 + t * (TRIPLEN_NEUTRAL_PEAK_FACTOR - 1);
}

/** Qualitative total-harmonic-distortion band derived from the non-linear share. */
export type ThdBand = 'low' | 'moderate' | 'high';

/** Non-linear-fraction breakpoints between the qualitative THD bands. */
export const THD_BAND_BREAKS = { moderate: 0.2, high: 0.45 } as const;

/** Map a panel's non-linear load fraction (0–1) to a qualitative THD band. */
export function thdBand(nonLinearFraction: number): ThdBand {
  if (nonLinearFraction >= THD_BAND_BREAKS.high) return 'high';
  if (nonLinearFraction >= THD_BAND_BREAKS.moderate) return 'moderate';
  return 'low';
}
