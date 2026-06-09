/**
 * Protective device and busbar reference data.
 *   - MCB ratings per IEC 60898; MCCB preferred ratings per IEC 60947-2.
 *   - Copper busbar ampacities, single bar, ~30 degC temperature rise.
 */

/** Standard MCB ratings (A), IEC 60898. */
export const MCB_RATINGS_A = [6, 10, 16, 20, 25, 32, 40, 50, 63] as const;

/** Standard MCCB preferred ratings (A), IEC 60947-2 (R10 series). */
export const MCCB_RATINGS_A = [
  80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
] as const;

/** All standard breaker frame ratings, ascending. */
export const STANDARD_BREAKER_RATINGS_A: readonly number[] = [
  ...MCB_RATINGS_A,
  ...MCCB_RATINGS_A,
];

export type BreakerCurve = 'B' | 'C' | 'D';
export type BreakerClass = 'MCB' | 'MCCB';

/** A rating <= 63 A is an MCB frame; above it is an MCCB frame. */
export function breakerClassFor(ratingA: number): BreakerClass {
  return ratingA <= 63 ? 'MCB' : 'MCCB';
}

/**
 * Recommended trip curve by load character (IEC 60898):
 *   B - resistive / lighting; C - general / mildly inductive; D - high inrush.
 */
export function recommendedCurve(loadKind: 'lighting' | 'general' | 'motor'): BreakerCurve {
  switch (loadKind) {
    case 'lighting':
      return 'B';
    case 'motor':
      return 'D';
    default:
      return 'C';
  }
}

/**
 * Conservative continuous current density for sizing a copper busbar that exceeds
 * the tabulated sizes (A/mm²). Large bars cool worse than small ones, so the
 * fallback uses ~1.3 A/mm² — in line with the top of {@link COPPER_BUSBAR_TABLE}
 * (1000 mm² → 1430 A ≈ 1.43 A/mm²) and slightly conservative beyond it, rather
 * than the ~1.5 A/mm² that only holds for small, edge-cooled bars.
 */
export const COPPER_CURRENT_DENSITY_A_PER_MM2 = 1.3;

export interface BusbarSize {
  /** Bar width (mm). */
  widthMm: number;
  /** Bar thickness (mm). */
  thicknessMm: number;
  /** Cross-sectional area (mm^2). */
  csaMm2: number;
  /** Continuous current rating, single bar (A). */
  ampacityA: number;
}

/**
 * Standard copper flat-bar sizes and approximate continuous ratings (single bar,
 * ~30 degC rise, painted). Larger sections trend toward ~1.3-1.6 A/mm^2; small
 * bars run higher due to edge cooling. Ascending by ampacity.
 */
export const COPPER_BUSBAR_TABLE: readonly BusbarSize[] = [
  { widthMm: 12, thicknessMm: 2, csaMm2: 24, ampacityA: 110 },
  { widthMm: 15, thicknessMm: 3, csaMm2: 45, ampacityA: 170 },
  { widthMm: 20, thicknessMm: 3, csaMm2: 60, ampacityA: 200 },
  { widthMm: 25, thicknessMm: 3, csaMm2: 75, ampacityA: 230 },
  { widthMm: 20, thicknessMm: 5, csaMm2: 100, ampacityA: 270 },
  { widthMm: 25, thicknessMm: 5, csaMm2: 125, ampacityA: 310 },
  { widthMm: 30, thicknessMm: 5, csaMm2: 150, ampacityA: 370 },
  { widthMm: 40, thicknessMm: 5, csaMm2: 200, ampacityA: 460 },
  { widthMm: 50, thicknessMm: 5, csaMm2: 250, ampacityA: 550 },
  { widthMm: 50, thicknessMm: 10, csaMm2: 500, ampacityA: 800 },
  { widthMm: 60, thicknessMm: 10, csaMm2: 600, ampacityA: 930 },
  { widthMm: 80, thicknessMm: 10, csaMm2: 800, ampacityA: 1180 },
  { widthMm: 100, thicknessMm: 10, csaMm2: 1000, ampacityA: 1430 },
];
