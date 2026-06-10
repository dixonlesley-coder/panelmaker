/**
 * Soil-resistivity and earth-rod reference data for grounding-electrode design,
 * per IEC 60364-5-54, BS 7430 (Code of practice for protective earthing) and
 * PUIL 2011 §3. Stamped with STANDARDS_VERSION.
 *
 * Soil resistivity ρ (Ω·m) varies enormously with moisture, temperature and
 * composition; the values below are *typical mid-range* figures (BS 7430 Table 2
 * / IEEE Std 142 "Green Book") intended for first-pass electrode sizing. Always
 * confirm with an on-site Wenner four-pole resistivity survey before
 * construction, as the achieved resistance is dominated by the local soil.
 */

import { STANDARDS_VERSION } from './version';

export const SOIL_STANDARD = STANDARDS_VERSION;

export interface SoilType {
  /** Stable machine key. */
  key: string;
  /** Human-readable soil description. */
  label: string;
  /** Typical resistivity ρ in ohm-metres (Ω·m). */
  resistivityOhmM: number;
}

/**
 * Typical soil resistivities, ascending by ρ (wettest/most-conductive first).
 * Source: BS 7430 Table 2 and IEEE Std 142 typical values.
 */
export const SOIL_TYPES: readonly SoilType[] = [
  { key: 'marshy', label: 'Marshy / very wet ground', resistivityOhmM: 30 },
  { key: 'clay', label: 'Clay', resistivityOhmM: 50 },
  { key: 'loam', label: 'Loam / farmland (moist)', resistivityOhmM: 100 },
  { key: 'sandy_clay', label: 'Sandy clay', resistivityOhmM: 150 },
  { key: 'sand', label: 'Sand', resistivityOhmM: 500 },
  { key: 'gravel', label: 'Gravel', resistivityOhmM: 1000 },
  { key: 'rock', label: 'Rocky ground / rock', resistivityOhmM: 3000 },
];

/** Default soil type used when none is specified (moist loam, ρ = 100 Ω·m). */
export const DEFAULT_SOIL_KEY = 'loam';

/** Look up a soil resistivity by key, falling back to the default loam value. */
export function soilResistivityByKey(key: string): number {
  const found = SOIL_TYPES.find((s) => s.key === key);
  return found ? found.resistivityOhmM : 100;
}

/**
 * Standard driven earth-rod lengths (m). 2.4 m (8 ft) and 3.0 m rods are the
 * usual stock items; 1.5 m for shallow/sectional use (BS 7430 §9, PUIL 2011 §3).
 */
export const ROD_LENGTHS_M = [1.5, 2.4, 3.0] as const;

/** Default rod length when unspecified (3.0 m driven rod). */
export const DEFAULT_ROD_LENGTH_M = 3.0;

/**
 * Standard copper-bonded earth-rod diameter (mm). 16 mm (5/8 in) is the common
 * Indonesian/IEC stock size; the resistance is only weakly (logarithmically)
 * sensitive to diameter.
 */
export const DEFAULT_ROD_DIAMETER_MM = 16;

/**
 * PUIL earthing-electrode resistance target (Ω). Defined locally to keep this
 * module self-contained (mirrors MAX_EARTH_RESISTANCE_OHM in standards/grounding,
 * PUIL 2011 §3).
 */
export const TARGET_ELECTRODE_OHM = 5;

/**
 * Utilisation (combining) factor η for n vertical rods in parallel, spaced about
 * one rod-length apart. Mutual resistance between rods means the parallel
 * resistance is worse than R_single/n, so η < 1 (BS 7430 §9.5 / IEEE 142). Values
 * decline gently as more rods crowd the same ground.
 */
export interface RodUtilisation {
  /** Number of rods in the array. */
  count: number;
  /** Utilisation factor η (0–1) at ~one rod-length spacing. */
  eta: number;
}

/** Utilisation factors by rod count (~one rod-length spacing), descending η. */
export const ROD_UTILISATION: readonly RodUtilisation[] = [
  { count: 1, eta: 1.0 },
  { count: 2, eta: 0.86 },
  { count: 3, eta: 0.82 },
  { count: 4, eta: 0.8 },
  { count: 5, eta: 0.78 },
  { count: 6, eta: 0.76 },
  { count: 8, eta: 0.73 },
  { count: 10, eta: 0.7 },
];

/** Nominal utilisation factor for "several" rods one rod-length apart. */
export const DEFAULT_ROD_UTILISATION = 0.8;
