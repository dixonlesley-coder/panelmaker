/**
 * Arc-flash / incident-energy estimate (pure).
 *
 * A SIMPLIFIED estimate of the thermal incident energy at a panel bus and the
 * resulting NFPA 70E PPE category, using the Ralph Lee maximum-power method as a
 * conservative closed form. This is a design-stage RISK SCREEN, not an
 * IEEE 1584-2018 study — it does not model arc-current reduction, enclosure
 * geometry, or device time-current curves. See `standards/arcFlash`.
 *
 * Lee method (maximum-power-transfer, conservative for LV):
 *   E[J/cm²] = 5.12e5 · V[kV] · I_bf[kA] · ( t[s] / D[cm]² )
 *   E[cal/cm²] = E[J/cm²] / 4.184
 * The arc-flash boundary is the distance at which E falls to 1.2 cal/cm².
 */

import {
  ARC_FLASH_BOUNDARY_IE_CAL_CM2,
  ARCING_TIME_S,
  DEFAULT_ARCING_TIME_S,
  NO_SAFE_PPE_CAL_CM2,
  WORKING_DISTANCE_MM,
  ppeCategory,
} from '../standards/arcFlash';
import type { BreakerClass } from '../standards/protection';
import type { ArcFlashResult, Warning } from '../types/results';
import { round } from './util';

/** Joules per calorie (thermochemical). */
const J_PER_CAL = 4.184;

export interface ArcFlashInput {
  /** Prospective bolted 3-phase fault current at the bus (A). */
  boltedFaultA: number;
  /** System line voltage at the bus (V). */
  voltageV: number;
  /** Upstream incomer device class (drives the assumed clearing time). */
  incomerClass?: BreakerClass;
  /** Working distance (mm); defaults to the LV-switchgear standard. */
  workingDistanceMm?: number;
}

/**
 * Lee-method incident energy (cal/cm²) at a distance D for a given fault.
 *   E[J/cm²] = 5.12e5 · Vkv · Ika · t / Dcm²
 */
function leeIncidentEnergyCalCm2(
  voltageV: number,
  boltedFaultA: number,
  arcingTimeS: number,
  distanceMm: number,
): number {
  const vKv = voltageV / 1000;
  const iKa = boltedFaultA / 1000;
  const dCm = distanceMm / 10;
  if (dCm <= 0) return Infinity;
  const eJ = 5.12e5 * vKv * iKa * (arcingTimeS / (dCm * dCm));
  return eJ / J_PER_CAL;
}

/**
 * Estimate the incident energy, PPE category and arc-flash boundary at a bus.
 * Returns `undefined` when there is no meaningful fault to assess.
 */
export function computeArcFlash(i: ArcFlashInput): ArcFlashResult | undefined {
  if (i.boltedFaultA <= 0 || i.voltageV <= 0) return undefined;

  const workingDistanceMm = i.workingDistanceMm ?? WORKING_DISTANCE_MM;
  const arcingTimeS = i.incomerClass ? ARCING_TIME_S[i.incomerClass] : DEFAULT_ARCING_TIME_S;

  const ie = leeIncidentEnergyCalCm2(i.voltageV, i.boltedFaultA, arcingTimeS, workingDistanceMm);
  const incidentEnergyCalCm2 = round(ie, 2);

  // Arc-flash boundary: distance where E = 1.2 cal/cm². E ∝ 1/D², so
  // D_afb = D_work · sqrt(E_work / 1.2).
  const arcFlashBoundaryMm = round(
    workingDistanceMm * Math.sqrt(incidentEnergyCalCm2 / ARC_FLASH_BOUNDARY_IE_CAL_CM2),
    0,
  );

  const category = ppeCategory(incidentEnergyCalCm2);

  let note =
    `Lee-method estimate at ${workingDistanceMm} mm, ${arcingTimeS} s clearing — ${category}.` +
    ' Simplified screen; confirm with a full IEEE 1584 study.';
  if (incidentEnergyCalCm2 > NO_SAFE_PPE_CAL_CM2) {
    note =
      `Incident energy ${incidentEnergyCalCm2} cal/cm² exceeds ${NO_SAFE_PPE_CAL_CM2} cal/cm² — no listed PPE; de-energize or reduce clearing time (instantaneous setting / zone-selective interlocking / current-limiting device). ` +
      note;
  } else if (incidentEnergyCalCm2 > 8) {
    note =
      `High incident energy — reduce clearing time (instantaneous / zone-selective interlocking) or a current-limiting device to lower the PPE category. ` +
      note;
  }

  return {
    incidentEnergyCalCm2,
    workingDistanceMm,
    arcingTimeS,
    ppeCategory: category,
    arcFlashBoundaryMm,
    note,
  };
}

/** Raise warnings from a bus arc-flash estimate for the warnings pipeline. */
export function arcFlashWarnings(a: ArcFlashResult, panelId?: string): Warning[] {
  const out: Warning[] = [];
  const base = panelId !== undefined ? { panelId } : {};
  if (a.incidentEnergyCalCm2 > NO_SAFE_PPE_CAL_CM2) {
    out.push({
      code: 'arc-flash-extreme',
      severity: 'error',
      message: `Arc-flash incident energy ${a.incidentEnergyCalCm2} cal/cm² exceeds ${NO_SAFE_PPE_CAL_CM2} cal/cm² — de-energize / reduce clearing time. ${a.note}`,
      ...base,
    });
  } else if (a.incidentEnergyCalCm2 > 8) {
    out.push({
      code: 'arc-flash-high',
      severity: 'warning',
      message: `Arc-flash incident energy ${a.incidentEnergyCalCm2} cal/cm² (${a.ppeCategory}) — consider faster clearing or current-limiting protection. ${a.note}`,
      ...base,
    });
  }
  return out;
}
