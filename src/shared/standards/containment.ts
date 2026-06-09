/**
 * Cable-containment reference data — standard conduit bores and cable-tray
 * widths, plus the conductor-fill limits. Stamped with STANDARDS_VERSION.
 *
 * Fill limits follow IEC 60364-5-52 / NEC Ch. 9 Table 1: one cable 53%, two
 * cables 31%, three-or-more 40% of the conduit bore. Cable outer-diameter
 * estimates (in `engine/containment`) and the resulting sizes are first-pass
 * approximations — verify against manufacturer cable data before construction.
 */

import { STANDARDS_VERSION } from './version';

export const CONTAINMENT_STANDARD = STANDARDS_VERSION;

export interface ConduitSize {
  /** Nominal trade size (mm). */
  nominalMm: number;
  /** Usable internal diameter (mm). */
  internalDiaMm: number;
}

/** Standard rigid conduit sizes (metric), ascending by bore. */
export const CONDUIT_SIZES: readonly ConduitSize[] = [
  { nominalMm: 16, internalDiaMm: 12.5 },
  { nominalMm: 20, internalDiaMm: 16.9 },
  { nominalMm: 25, internalDiaMm: 21.4 },
  { nominalMm: 32, internalDiaMm: 27.8 },
  { nominalMm: 40, internalDiaMm: 35.4 },
  { nominalMm: 50, internalDiaMm: 44.3 },
  { nominalMm: 63, internalDiaMm: 56.5 },
];

/** Internal cross-sectional area of a conduit (mm^2). */
export function conduitInternalAreaMm2(c: ConduitSize): number {
  return (Math.PI / 4) * c.internalDiaMm * c.internalDiaMm;
}

/** Conductor-fill limits (fraction of conduit bore), IEC 60364-5-52 / NEC. */
export const CONDUIT_FILL_SINGLE = 0.53;
export const CONDUIT_FILL_TWO = 0.31;
export const CONDUIT_FILL_MANY = 0.4;

/** Standard cable-tray (ladder / perforated) widths (mm), ascending. */
export const CABLE_TRAY_WIDTHS_MM = [50, 75, 100, 150, 200, 300, 450, 600] as const;

/**
 * Spacing allowance for cables laid side-by-side in a single tray layer
 * (1.0 = touching; >1 leaves air gaps that help the grouping derating).
 */
export const TRAY_PACKING_FACTOR = 1.1;
