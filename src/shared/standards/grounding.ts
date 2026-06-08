/**
 * Earthing (grounding) and protective-conductor reference data, per PUIL 2011
 * and IEC 60364-5-54.
 */

import type { EarthingSystem } from '../types/electrical';
import { STANDARD_SECTIONS_MM2 } from './conductors';

export interface EarthingSystemInfo {
  value: EarthingSystem;
  label: string;
  note: string;
}

export const EARTHING_SYSTEMS: readonly EarthingSystemInfo[] = [
  {
    value: 'TN-C-S',
    label: 'TN-C-S (PME)',
    note: 'Combined PEN from the source, split into separate N and PE at the origin. Common PLN practice.',
  },
  {
    value: 'TN-S',
    label: 'TN-S',
    note: 'Separate neutral and protective conductors throughout the installation.',
  },
  {
    value: 'TT',
    label: 'TT',
    note: 'Installation earthed via a local electrode; requires RCD protection. Common for standalone/rural sites.',
  },
];

export const DEFAULT_EARTHING_SYSTEM: EarthingSystem = 'TN-C-S';

/** PUIL earthing-electrode resistance target (ohm). */
export const MAX_EARTH_RESISTANCE_OHM = 5;

/**
 * Protective-earth (PE) conductor cross-section from the phase CSA
 * (IEC 60364-5-54 Table 54.2): S<=16 -> S; 16<S<=35 -> 16; S>35 -> S/2.
 */
export function peConductorSize(phaseCsaMm2: number): number {
  if (phaseCsaMm2 <= 16) return phaseCsaMm2;
  if (phaseCsaMm2 <= 35) return 16;
  const half = phaseCsaMm2 / 2;
  return STANDARD_SECTIONS_MM2.find((s) => s >= half) ?? half;
}

/**
 * Neutral conductor cross-section. A full-size neutral (= phase) is used by
 * default; a reduced neutral (down to S/2, min 16 mm²) is permitted for balanced
 * three-phase circuits without significant harmonic content.
 */
export function neutralConductorSize(phaseCsaMm2: number, reduced = false): number {
  if (!reduced || phaseCsaMm2 <= 16) return phaseCsaMm2;
  const half = phaseCsaMm2 / 2;
  const candidate = STANDARD_SECTIONS_MM2.find((s) => s >= Math.max(16, half)) ?? phaseCsaMm2;
  return candidate;
}
