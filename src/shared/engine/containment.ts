/**
 * Cable-containment sizing (pure): conduit fill per circuit and cable-tray
 * width per panel.
 *
 * The cable outer diameter is estimated from the conductor CSA and core count
 * (a circular-layup approximation), then the smallest standard conduit whose
 * usable bore satisfies the fill rule is chosen. Per panel, the outgoing cables
 * are laid side-by-side in a single tray layer to pick a standard tray width.
 *
 * These are first-pass engineering estimates for take-off and routing — verify
 * against manufacturer cable diameters and the installation layout.
 */

import {
  CABLE_TRAY_WIDTHS_MM,
  CONDUIT_FILL_SINGLE,
  CONDUIT_SIZES,
  TRAY_PACKING_FACTOR,
  conduitInternalAreaMm2,
} from '../standards/containment';
import type { CableTrayResult, ContainmentResult } from '../types/results';
import { round } from './util';

/** Circular cabling lay-up factors (overall-over-core diameter) for n cores. */
const LAYUP_FACTOR: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 2.16,
  4: 2.42,
  5: 2.7,
};

/** Cross-sectional area of a circle of the given diameter (mm^2). */
function circleAreaMm2(diaMm: number): number {
  return (Math.PI / 4) * diaMm * diaMm;
}

/**
 * Estimated overall outer diameter (mm) of a PVC-insulated multi-core cable of
 * the given conductor CSA and core count. Conductor diameter from the CSA, a
 * CSA-scaled insulation thickness, the circular lay-up of the cores, and an
 * outer sheath.
 */
export function cableOuterDiameterMm(csaMm2: number, cores: number): number {
  if (csaMm2 <= 0) return 0;
  const conductorDiaMm = 2 * Math.sqrt(csaMm2 / Math.PI);
  const insulationThkMm = 0.7 + 0.05 * Math.sqrt(csaMm2);
  const coreDiaMm = conductorDiaMm + 2 * insulationThkMm;
  const n = Math.min(Math.max(Math.round(cores), 1), 5);
  const layup = LAYUP_FACTOR[n] ?? Math.sqrt(n) + 1;
  const sheathThkMm = 1.0 + 0.05 * coreDiaMm;
  return round(coreDiaMm * layup + 2 * sheathThkMm, 1);
}

/**
 * Smallest standard conduit housing a single cable at <= 53% fill. When the
 * cable exceeds the largest standard conduit, the largest is returned with its
 * (over-) fill so the caller can flag it.
 */
export function sizeConduit(cableOdMm: number): ContainmentResult {
  const cableArea = circleAreaMm2(cableOdMm);
  for (const c of CONDUIT_SIZES) {
    const bore = conduitInternalAreaMm2(c);
    if (cableArea <= bore * CONDUIT_FILL_SINGLE) {
      return {
        cableOdMm: round(cableOdMm, 1),
        conduitSizeMm: c.nominalMm,
        fillPct: round((cableArea / bore) * 100, 1),
      };
    }
  }
  const largest = CONDUIT_SIZES[CONDUIT_SIZES.length - 1]!;
  return {
    cableOdMm: round(cableOdMm, 1),
    conduitSizeMm: largest.nominalMm,
    fillPct: round((cableArea / conduitInternalAreaMm2(largest)) * 100, 1),
  };
}

/** Conduit sizing for a circuit cable from its CSA and core count. */
export function sizeCircuitConduit(csaMm2: number, cores: number): ContainmentResult {
  return sizeConduit(cableOuterDiameterMm(csaMm2, cores));
}

/**
 * Smallest standard tray holding the cables side-by-side in a single layer
 * (required width = sum of cable ODs x packing factor). When the cables exceed
 * the widest standard tray, the widest is returned with its (over-) fill.
 */
export function sizeCableTray(cableOdsMm: number[]): CableTrayResult {
  const cables = cableOdsMm.filter((d) => d > 0);
  const requiredWidth = cables.reduce((s, d) => s + d, 0) * TRAY_PACKING_FACTOR;
  for (const w of CABLE_TRAY_WIDTHS_MM) {
    if (requiredWidth <= w) {
      return { widthMm: w, fillPct: round((requiredWidth / w) * 100, 1), cableCount: cables.length };
    }
  }
  const widest = CABLE_TRAY_WIDTHS_MM[CABLE_TRAY_WIDTHS_MM.length - 1]!;
  return {
    widthMm: widest,
    fillPct: round((requiredWidth / widest) * 100, 1),
    cableCount: cables.length,
  };
}
