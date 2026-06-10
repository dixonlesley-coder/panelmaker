/**
 * Short-circuit withstand reference data for a bare copper busbar / assembly.
 *
 * An assembly's busbar system must survive a short circuit both *thermally*
 * (the I²t energy let through before the protective device clears, expressed as
 * the rated short-time withstand current Icw for an assigned time) and
 * *mechanically* (the electromagnetic force of the asymmetric peak current Ipk,
 * the rated peak withstand current Ipk). This module provides the pure constants
 * for those two checks; the mechanical bar-support spacing/strength itself is out
 * of scope and only the peak current the supports must resist is reported.
 *
 * References:
 *   - IEC 61439-1 §9.3 (short-circuit withstand strength); Table 7 (relation
 *     between prospective short-circuit current and peak current).
 *   - IEC 60909-0 (short-circuit currents — peak factor / asymmetry).
 *
 * Pure data, stamped with {@link STANDARDS_VERSION}; no Node/DOM dependency.
 */

import { STANDARDS_VERSION } from './version';

/** The standards version these busbar-fault constants were authored under. */
export const BUSBAR_FAULT_STANDARDS_VERSION = STANDARDS_VERSION;

/**
 * One-second short-time withstand current *density* for a bare copper bar
 * (A/mm²). A short circuit is treated as adiabatic — far too brief for the bar
 * to shed heat — so all the I²t energy raises the bar temperature. The 1-second
 * rating is the current density that lifts a copper bar from a normal operating
 * temperature (~70 °C) to a permitted short-circuit limit (~200–300 °C) in one
 * second.
 *
 * ~80 A/mm² is a conservative engineering value within the commonly quoted
 * 80–110 A/mm² band for copper. Because the process is adiabatic the short-time
 * withstand current scales with the square root of time:
 *
 *     Icw(t) = Icw(1 s) / √t
 *
 * i.e. a shorter clearing time permits a proportionally higher current
 * (IEC 61439-1 §9.3.2). The 1-second basis matches the way assembly Icw ratings
 * are conventionally declared.
 */
export const BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2 = 80;

/**
 * One entry of the IEC 61439-1 Table 7 correlation between the prospective rms
 * short-circuit current and the peak factor n (= Ipk / Irms). The factor folds
 * in the worst-case asymmetry (DC offset) expected at that fault level, so it is
 * applied directly to the rms current.
 */
export interface PeakFactorBand {
  /** Upper bound of the band — prospective rms short-circuit current (kA). */
  maxKa: number;
  /** Peak factor n for this band (Ipk / Irms). */
  n: number;
}

/**
 * IEC 61439-1 Table 7 — peak factor n as a function of the prospective rms
 * short-circuit current. Higher fault levels are fed from stiffer (more
 * reactive) sources with a larger X/R ratio and therefore a greater asymmetry,
 * so n rises with the fault level. Ordered by ascending upper bound; the final
 * band's `maxKa` is `Infinity` (the open-ended "> 50 kA" row).
 *
 *   Icp ≤  5 kA → 1.5
 *   5 < Icp ≤ 10 kA → 1.7
 *  10 < Icp ≤ 20 kA → 2.0
 *  20 < Icp ≤ 50 kA → 2.1
 *       Icp > 50 kA → 2.2
 */
export const PEAK_FACTOR_TABLE: readonly PeakFactorBand[] = [
  { maxKa: 5, n: 1.5 },
  { maxKa: 10, n: 1.7 },
  { maxKa: 20, n: 2.0 },
  { maxKa: 50, n: 2.1 },
  { maxKa: Infinity, n: 2.2 },
];

/**
 * Peak factor n (Ipk / Irms) for a prospective rms short-circuit current, per
 * the IEC 61439-1 Table 7 bands in {@link PEAK_FACTOR_TABLE}. Bands are
 * inclusive of their upper bound (e.g. exactly 5 kA → 1.5, 10 kA → 1.7); a
 * non-positive input falls in the lowest band.
 *
 * @param faultKa Prospective rms short-circuit current (kA).
 * @returns The peak factor n for that fault level.
 */
export function peakFactor(faultKa: number): number {
  for (const band of PEAK_FACTOR_TABLE) {
    if (faultKa <= band.maxKa) return band.n;
  }
  // Unreachable: the final band's maxKa is Infinity. Guarded for totality.
  const last = PEAK_FACTOR_TABLE[PEAK_FACTOR_TABLE.length - 1];
  return last ? last.n : 2.2;
}

/**
 * Assumed centre-to-centre spacing between adjacent phase bars (mm) for the
 * electromagnetic-force estimate — a common LV switchboard pitch. Closer bars
 * see a larger force (F ∝ 1/d), so a tighter custom layout must be re-checked.
 */
export const BUSBAR_PHASE_SPACING_MM = 60;

/**
 * Permissible bending stress for hard-drawn copper bar under short-circuit
 * forces (N/mm²) — a design value comfortably under Rp0.2 (~250 N/mm²), per
 * common switchboard-builder practice and CDA publication 22 guidance.
 */
export const COPPER_BENDING_STRESS_N_MM2 = 120;
