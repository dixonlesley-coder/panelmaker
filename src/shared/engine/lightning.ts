/**
 * IEC 62305-2 lightning risk screening (simplified frequency method).
 *
 * Computes the structure's lightning collection area, the expected number of
 * dangerous direct strikes per year `Nd`, and compares it to the tolerable
 * frequency `Nc` to decide whether a Lightning Protection System (LPS) is
 * required and, if so, at what protection level. Pure — no Node/DOM.
 */

import type { SiteConditions } from '../types/project';
import {
  DEFAULT_GROUND_FLASH_DENSITY,
  TOLERABLE_EVENTS_PER_YEAR,
  lpsLevelForEfficiency,
  type LpsLevel,
} from '../standards/lightning';
import { round } from './util';

export interface LightningRiskResult {
  /** Lightning collection area of the structure (m²). */
  collectionAreaM2: number;
  /** Ground flash density used (flashes/km²/year). */
  groundFlashDensity: number;
  /** Expected dangerous events per year (Nd). */
  eventsPerYear: number;
  /** Tolerable events per year (Nc). */
  tolerablePerYear: number;
  /** True when Nd > Nc — an LPS is recommended. */
  lpsRequired: boolean;
  /** Required protection efficiency E = 1 − Nc/Nd (0 when not required). */
  efficiency: number;
  /** Recommended LPS protection level, or null when none is required. */
  level: LpsLevel | null;
  note: string;
}

/**
 * The collection area Ad for an isolated rectangular structure L×W×H (IEC
 * 62305-2 §A.2): the footprint plus the area swept by a 1:3 rolling-sphere skirt.
 * Ad = L·W + 2·(3H)·(L+W) + π·(3H)² (m²).
 */
export function collectionArea(lengthM: number, widthM: number, heightM: number): number {
  const h3 = 3 * heightM;
  return lengthM * widthM + 2 * h3 * (lengthM + widthM) + Math.PI * h3 * h3;
}

/**
 * Screen the lightning risk from the site's building dimensions. Returns
 * `undefined` when the footprint/height are not supplied (nothing to compute).
 */
export function assessLightningRisk(site: SiteConditions | undefined): LightningRiskResult | undefined {
  const L = site?.buildingLengthM;
  const W = site?.buildingWidthM;
  const H = site?.buildingHeightM;
  if (!L || !W || !H || L <= 0 || W <= 0 || H <= 0) return undefined;

  const ng = site?.groundFlashDensity ?? DEFAULT_GROUND_FLASH_DENSITY;
  const cd = site?.lightningLocationFactor ?? 1;
  const ad = collectionArea(L, W, H);
  // Nd = Ng · Ad · Cd · 1e-6 (Ad m² → km²).
  const nd = ng * ad * cd * 1e-6;
  const nc = TOLERABLE_EVENTS_PER_YEAR;
  const lpsRequired = nd > nc;
  const efficiency = lpsRequired ? 1 - nc / nd : 0;
  const level = lpsLevelForEfficiency(efficiency);

  const note = lpsRequired
    ? `Expected direct strikes Nd ≈ ${round(nd, 4)}/yr exceed the tolerable ${nc}/yr — an external LPS to protection level ${level} (IEC 62305) is recommended, plus a coordinated Type 1 SPD at the service.`
    : `Expected direct strikes Nd ≈ ${round(nd, 4)}/yr are within the tolerable ${nc}/yr — no external LPS is indicated by the screening; surge protection still applies.`;

  return {
    collectionAreaM2: round(ad, 0),
    groundFlashDensity: ng,
    eventsPerYear: round(nd, 5),
    tolerablePerYear: nc,
    lpsRequired,
    efficiency: round(efficiency, 3),
    level,
    note,
  };
}
