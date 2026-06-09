/**
 * Arc-flash / incident-energy reference data, stamped with STANDARDS_VERSION.
 *
 * A SIMPLIFIED IEEE 1584 / Ralph Lee estimate of the thermal incident energy at
 * a panel bus, used to assign an NFPA 70E arc-flash PPE category. This is an
 * ESTIMATE for early design risk-screening, NOT a substitute for a full
 * IEEE 1584-2018 arc-flash study (which requires measured electrode geometry,
 * enclosure size, and device time-current curves).
 *
 * References: IEEE 1584-2018 (incident energy), NFPA 70E Table 130.5(G) (PPE
 * categories by cal/cm²). Constants below are conservative LV-switchgear values.
 */

import type { BreakerClass } from './protection';

/** Standard working distance for LV switchgear arc-flash assessment (mm). */
export const WORKING_DISTANCE_MM = 455;

/** Typical electrode gap for LV switchgear (mm), per IEEE 1584. */
export const ELECTRODE_GAP_MM = 18;

/** Incident energy at the arc-flash boundary, by definition (cal/cm²). */
export const ARC_FLASH_BOUNDARY_IE_CAL_CM2 = 1.2;

/**
 * Distance exponent x in the IEEE 1584 incident-energy distance term for LV
 * switchgear / panelboards in a box (≈1.473). Energy falls as (610/D)^x.
 */
export const DISTANCE_EXPONENT = 1.473;

/** Reference (normalising) distance in the IEEE 1584 distance term (mm). */
export const REFERENCE_DISTANCE_MM = 610;

/**
 * Assumed protective-device clearing time (s) used as the arcing duration when
 * no time-current data is available. Instantaneous-tripping devices (MCB-class)
 * clear an arcing fault in roughly half a cycle; MCCBs without a guaranteed
 * instantaneous setting are assumed to ride into the short-time band. A
 * conservative default is applied otherwise.
 */
export const ARCING_TIME_S: Readonly<Record<BreakerClass, number>> = {
  MCB: 0.05, // ~half-cycle magnetic trip
  MCCB: 0.2, // conservative short-time clearing
};

/** Conservative default arcing time when no incomer device is known (s). */
export const DEFAULT_ARCING_TIME_S = 0.2;

/** Arc-flash PPE category labels with their cal/cm² upper bounds (NFPA 70E). */
export interface PpeBand {
  label: string;
  /** Upper incident-energy bound for this band (cal/cm²). */
  maxCalCm2: number;
}

/**
 * NFPA 70E PPE bands by incident energy. The category ceiling is 40 cal/cm²;
 * above it, no listed arc-rated PPE applies and the work must be de-energized.
 */
export const PPE_BANDS: readonly PpeBand[] = [
  { label: 'No arc-rated PPE (<1.2 cal/cm²)', maxCalCm2: 1.2 },
  { label: 'CAT 1 (≤4 cal/cm²)', maxCalCm2: 4 },
  { label: 'CAT 2 (≤8 cal/cm²)', maxCalCm2: 8 },
  { label: 'CAT 3 (≤25 cal/cm²)', maxCalCm2: 25 },
  { label: 'CAT 4 (≤40 cal/cm²)', maxCalCm2: 40 },
];

/** Incident energy above which the work cannot be performed energized (cal/cm²). */
export const NO_SAFE_PPE_CAL_CM2 = 40;

/** Map an incident energy (cal/cm²) to an NFPA 70E PPE category label. */
export function ppeCategory(incidentEnergyCalCm2: number): string {
  if (incidentEnergyCalCm2 > NO_SAFE_PPE_CAL_CM2) {
    return 'No safe PPE — de-energize';
  }
  const band = PPE_BANDS.find((b) => incidentEnergyCalCm2 <= b.maxCalCm2);
  return band ? band.label : `CAT 4 (≤${NO_SAFE_PPE_CAL_CM2} cal/cm²)`;
}
