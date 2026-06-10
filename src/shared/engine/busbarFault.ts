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
  BUSBAR_SHORT_TIME_DENSITY_A_PER_MM2,
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

  const note = adequate
    ? `Busbar thermal withstand Icw ${round(icwKa, 1)} kA (${round(t, 2)} s) covers the ` +
      `${round(faultKa, 1)} kA prospective fault. Peak withstand Ipk = ${round(ipkKa, 1)} kA ` +
      `(n = ${n}); verify bar supports/spacing for the mechanical peak — out of scope here.`
    : `Busbar thermal withstand Icw ${round(icwKa, 1)} kA (${round(t, 2)} s) is below the ` +
      `${round(faultKa, 1)} kA prospective fault — increase the bar cross-section or reduce the ` +
      `clearing time. Peak withstand Ipk = ${round(ipkKa, 1)} kA (n = ${n}); also verify bar ` +
      `supports/spacing for the mechanical peak — out of scope here.`;

  return {
    csaMm2: round(csaMm2, 1),
    faultKa: round(faultKa, 2),
    durationS: round(t, 3),
    icwKa: round(icwKa, 2),
    ipkKa: round(ipkKa, 2),
    peakFactor: n,
    adequate,
    note,
    clause: CLAUSE,
  };
}
