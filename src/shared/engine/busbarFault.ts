/**
 * Busbar / assembly short-circuit withstand check (pure).
 *
 * Given a busbar cross-sectional area, the prospective rms short-circuit current
 * and the protective device's clearing time, this verifies the two short-circuit
 * withstand requirements of IEC 61439-1 §9.3:
 *
 *   - *Thermal* (rated short-time withstand current, Icw): the bar must carry
 *     the I²t energy let through during the fault without exceeding its
 *     short-circuit temperature limit. The bar's Icw is derived from a
 *     1-second copper current density scaled by the adiabatic √t law:
 *
 *         Icw(t) = (density · CSA) / √t
 *
 *   - *Peak* (rated peak withstand current, Ipk): the asymmetric peak the bar
 *     and its supports must mechanically resist, Ipk = n · Irms, where the IEC
 *     61439-1 Table 7 peak factor n already includes the DC-offset asymmetry.
 *
 * The mechanical adequacy proper (bar support spacing, fixing strength) depends
 * on physical geometry that this module does not model; the required peak
 * current is reported so the designer can verify the supports separately.
 *
 * References: IEC 61439-1 §9.3 (short-circuit withstand strength) and Table 7
 * (peak factor); IEC 60909-0 (peak current / asymmetry).
 *
 * Pure: no Node/DOM dependency. Defines its own result type; nothing else in the
 * engine depends on it.
 */

import {
  BUSBAR_PHASE_SPACING_MM,
  BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2,
  COPPER_BENDING_STRESS_N_MM2,
  peakFactor,
} from '../standards/busbarFault';
import { round } from './util';

/**
 * Result of a busbar short-circuit withstand check. All currents are in kA rms
 * symmetrical except {@link ipkKa}, which is the asymmetric peak.
 */
export interface BusbarWithstandResult {
  /** Busbar cross-sectional area checked (mm², copper). */
  csaMm2: number;
  /** Prospective rms short-circuit current at the bus (kA). */
  faultKa: number;
  /** Fault duration / device clearing time used for the thermal check (s). */
  durationS: number;
  /**
   * Rated short-time withstand current of the bar for `durationS` (kA rms) —
   * the thermal capability. Equals the 1-second rating scaled by 1/√durationS.
   */
  icwKa: number;
  /**
   * Rated peak withstand current the bar and its supports must resist (kA peak),
   * Ipk = n · faultKa. The mechanical adequacy depends on bar supports/spacing
   * and is out of scope — this value is reported for the designer to verify.
   */
  ipkKa: number;
  /** Peak factor n (Ipk / Irms) applied at this fault level (IEC 61439-1 Table 7). */
  peakFactor: number;
  /** Whether the bar's thermal withstand (Icw) covers the prospective fault. */
  adequate: boolean;
  /**
   * Electromagnetic force per metre between adjacent phase bars at Ipk (N/m),
   * F/l = (μ0/2π)·Ipk²/d — present when the bar geometry is known.
   */
  forceNPerM?: number;
  /**
   * Maximum bar support (insulator) spacing so the bending stress at Ipk stays
   * within the copper design limit (mm). Conservative: weak-axis section
   * modulus, simply-supported span. Present when bar geometry is known.
   */
  maxSupportSpacingMm?: number;
  /** Assumed phase-to-phase bar spacing the force was computed at (mm). */
  phaseSpacingMm?: number;
  /** Human-readable summary, including the out-of-scope mechanical caveat. */
  note: string;
  /** Governing standard clause(s). */
  clause: string;
}

/**
 * Numerical tolerance (kA) when comparing Icw against the prospective fault, so
 * a bar rated exactly at the fault level reads as adequate despite floating-point
 * rounding.
 */
const TOLERANCE_KA = 1e-6;

const CLAUSE = 'IEC 61439-1 §9.3 & Table 7; IEC 60909-0';

/**
 * Minimum copper bar cross-section (mm²) whose thermal short-time withstand Icw
 * covers `faultKa` for `durationS`. Inverts the adiabatic Icw law
 *   icwKa = (density · csa / 1000) / √t  ≥  faultKa
 * so the bus sizer can floor the bar at the section the fault demands instead of
 * only flagging an inadequate bar after the fact.
 */
export function minCsaForWithstand(faultKa: number, durationS = 1): number {
  if (faultKa <= 0) return 0;
  const t = durationS > 0 ? durationS : 1;
  return (faultKa * 1000 * Math.sqrt(t)) / BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2;
}

/**
 * Check the short-circuit withstand of a copper busbar.
 *
 * The thermal rating uses the adiabatic 1-second copper current density:
 *
 *     icwKa = (BUSBAR_SHORT_TIME_DENSITY · csaMm2 / 1000) / √durationS
 *
 * so a shorter clearing time (e.g. a fast MCCB clearing in 0.2 s) raises the
 * effective Icw by 1/√durationS, while the default 1 s matches the conventional
 * assembly Icw declaration basis. The peak the bar/supports must withstand is
 *
 *     ipkKa = peakFactor(faultKa) · faultKa
 *
 * with the asymmetry already folded into the Table 7 factor n.
 *
 * @param csaMm2 Busbar cross-sectional area (mm², copper). Should be > 0.
 * @param faultKa Prospective rms short-circuit current at the bus (kA).
 * @param durationS Fault duration / device clearing time (s); defaults to 1 s.
 * @returns The {@link BusbarWithstandResult}.
 */
export function checkBusbarWithstand(
  csaMm2: number,
  faultKa: number,
  durationS = 1,
  /** Bar geometry — enables the mechanical support-spacing estimate. */
  bar?: { widthMm: number; thicknessMm: number },
): BusbarWithstandResult {
  // Guard against a non-positive duration that would divide by zero / go
  // imaginary; clamp to the standard 1-second basis.
  const t = durationS > 0 ? durationS : 1;

  // 1-second short-time withstand current (kA), then the adiabatic 1/√t scaling.
  const oneSecondKa = (BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2 * csaMm2) / 1000;
  const icwKa = oneSecondKa / Math.sqrt(t);

  const n = peakFactor(faultKa);
  const ipkKa = n * faultKa;

  const adequate = icwKa + TOLERANCE_KA >= faultKa;

  // Mechanical: force between adjacent bars at the peak, F/l = (μ0/2π)·Ipk²/d,
  // then the max simply-supported span keeping copper bending stress within the
  // design limit: σ = (F/l)·L²/(8·Z) ≤ σ_allow with the WEAK-axis section
  // modulus Z = w·t²/6 (conservative for either mounting orientation).
  let forceNPerM: number | undefined;
  let maxSupportSpacingMm: number | undefined;
  if (bar && bar.widthMm > 0 && bar.thicknessMm > 0 && ipkKa > 0) {
    const ipkA = ipkKa * 1000;
    const dM = BUSBAR_PHASE_SPACING_MM / 1000;
    forceNPerM = (2e-7 * ipkA * ipkA) / dM;
    const zMm3 = (bar.widthMm * bar.thicknessMm * bar.thicknessMm) / 6;
    // L² = 8·σ·Z / (F/l); N/mm² · mm³ / (N/m = N/1000mm) → mm².
    const l2Mm2 = (8 * COPPER_BENDING_STRESS_N_MM2 * zMm3) / (forceNPerM / 1000);
    maxSupportSpacingMm = Math.floor(Math.sqrt(l2Mm2) / 10) * 10; // round down to 10 mm
  }

  const mechanical =
    maxSupportSpacingMm !== undefined
      ? `Support the bars every ≤ ${maxSupportSpacingMm} mm (force ${round(forceNPerM ?? 0, 0)} N/m at Ipk, ${BUSBAR_PHASE_SPACING_MM} mm phase spacing).`
      : 'verify bar supports/spacing for the mechanical peak — out of scope here.';

  const note = adequate
    ? `Busbar thermal withstand Icw ${round(icwKa, 1)} kA (${round(t, 2)} s) covers the ` +
      `${round(faultKa, 1)} kA prospective fault. Peak withstand Ipk = ${round(ipkKa, 1)} kA ` +
      `(n = ${n}). ${mechanical}`
    : `Busbar thermal withstand Icw ${round(icwKa, 1)} kA (${round(t, 2)} s) is below the ` +
      `${round(faultKa, 1)} kA prospective fault — increase the bar cross-section or reduce the ` +
      `clearing time. Peak withstand Ipk = ${round(ipkKa, 1)} kA (n = ${n}). ${mechanical}`;

  return {
    csaMm2: round(csaMm2, 1),
    faultKa: round(faultKa, 2),
    durationS: round(t, 3),
    icwKa: round(icwKa, 2),
    ipkKa: round(ipkKa, 2),
    peakFactor: n,
    adequate,
    ...(forceNPerM !== undefined ? { forceNPerM: round(forceNPerM, 0) } : {}),
    ...(maxSupportSpacingMm !== undefined
      ? { maxSupportSpacingMm, phaseSpacingMm: BUSBAR_PHASE_SPACING_MM }
      : {}),
    note,
    clause: CLAUSE,
  };
}
