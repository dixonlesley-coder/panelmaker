/**
 * Fault-level and protection analysis (pure).
 *
 *   - Prospective short-circuit current (Isc, 3-phase symmetrical) at each
 *     panel bus, from the transformer/utility source and feeder-cable impedance.
 *   - Breaker breaking-capacity adequacy vs the prospective fault.
 *   - Earth-fault loop impedance (Zs) and ADS disconnection check for TN systems.
 *   - Current-based selectivity (discrimination) between cascaded breakers.
 *
 * References: IEC 60909 (fault levels), IEC 60364-4-41 (ADS / Zs), IEC 60898 /
 * 60947-2 (device characteristics).
 */

import {
  CONDUCTOR_X_OHM_PER_KM,
  conductorResistanceOhmPerKm,
} from '../standards/conductors';
import {
  CURVE_TRIP_MULTIPLE,
  DEFAULT_LV_UTILITY_FAULT_KA,
  NOMINAL_PHASE_VOLTAGE_V,
  ZS_VOLTAGE_FACTOR,
  breakerKa,
} from '../standards/fault';
import type { BreakerCurve } from '../standards/protection';
import type { EarthingSystem } from '../types/electrical';
import type { BreakerResult, SupplyResult } from '../types/results';
import { round } from './util';

/** A series cable impedance, ohms. */
export interface Impedance {
  rOhm: number;
  xOhm: number;
}

/** Magnitude |Z| = sqrt(R^2 + X^2). */
export function impedanceMagnitude(z: Impedance): number {
  return Math.sqrt(z.rOhm * z.rOhm + z.xOhm * z.xOhm);
}

/** Series sum of two impedances. */
export function addImpedance(a: Impedance, b: Impedance): Impedance {
  return { rOhm: a.rOhm + b.rOhm, xOhm: a.xOhm + b.xOhm };
}

/** Phase-conductor impedance of a run: R from the CSA table, X a flat per-km value. */
export function conductorImpedance(csaMm2: number, lengthM: number): Impedance {
  const km = lengthM / 1000;
  return {
    rOhm: conductorResistanceOhmPerKm(csaMm2) * km,
    xOhm: CONDUCTOR_X_OHM_PER_KM * km,
  };
}

/**
 * Source impedance (per phase, ohms) backing a prospective fault current at a
 * given line voltage: Z = V_LL / (sqrt(3) * Isc). Treated as a pure reactance
 * (X >> R upstream of the LV bus), which is the conservative assumption for Isc.
 */
export function sourceImpedanceFromIsc(iscA: number, lineVoltageV: number): Impedance {
  if (iscA <= 0) return { rOhm: 0, xOhm: 0 };
  return { rOhm: 0, xOhm: lineVoltageV / (Math.sqrt(3) * iscA) };
}

/**
 * Prospective 3-phase symmetrical fault current at the main LV bus (A).
 *   - MV supply: the transformer limits it to Isec / (Z%/100).
 *   - Direct LV supply: a default utility fault level at the origin.
 */
export function mainBusFaultA(supply: SupplyResult): number {
  if (supply.type === 'MV' && supply.transformerSecondaryA && supply.transformerImpedancePct) {
    return (supply.transformerSecondaryA / (supply.transformerImpedancePct / 100));
  }
  return DEFAULT_LV_UTILITY_FAULT_KA * 1000;
}

/**
 * Fault current (A) at a downstream node given the total per-phase source-to-node
 * impedance: Isc = V_LL / (sqrt(3) * |Ztotal|), clamped to the upstream value
 * (cable impedance can only reduce the available fault).
 */
export function downstreamFaultA(
  lineVoltageV: number,
  totalZ: Impedance,
  upstreamIscA: number,
): number {
  const z = impedanceMagnitude(totalZ);
  if (z <= 0) return upstreamIscA;
  const isc = lineVoltageV / (Math.sqrt(3) * z);
  return Math.min(isc, upstreamIscA);
}

export interface BreakerKaCheck {
  /** Specified device breaking capacity (kA). */
  breakerKa: number;
  /** True when the device can interrupt the prospective fault at its bus. */
  adequate: boolean;
}

/**
 * Specify and check a device's breaking capacity against the prospective fault
 * (kA) at the bus it protects. A device is adequate when its Icu >= Isc.
 */
export function checkBreakerKa(breaker: BreakerResult, prospectiveKa: number): BreakerKaCheck {
  const ka = breakerKa(breaker.ratingA, breaker.deviceClass, prospectiveKa);
  return { breakerKa: ka, adequate: ka + 1e-9 >= prospectiveKa };
}

export interface ZsCheck {
  /** Earth-fault loop impedance over the circuit run (ohm). */
  zsOhm: number;
  /** Maximum Zs that still guarantees disconnection in the required time (ohm). */
  zsMaxOhm: number;
  /** True when Zs <= Zs_max (automatic disconnection within the limit). */
  disconnectsInTime: boolean;
}

export interface ZsInput {
  earthingSystem: EarthingSystem;
  /** Source per-phase impedance at the circuit's panel bus. */
  sourceZ: Impedance;
  phaseCsaMm2: number;
  peCsaMm2: number;
  lengthM: number;
  curve: BreakerCurve;
  breakerRatingA: number;
}

/**
 * Earth-fault loop impedance and disconnection check (TN systems).
 *
 * Zs = Zsource + Zphase + Zpe over the run. The magnetic trip current
 * Ia = curveMultiple x In must flow, so the loop must not exceed
 * Zs_max = 0.95 x U0 / Ia. Only meaningful on TN earthing — TT relies on the
 * RCD (already modelled), so it is reported as satisfied (relaxed) here.
 */
export function checkZs(i: ZsInput): ZsCheck {
  const phaseZ = conductorImpedance(i.phaseCsaMm2, i.lengthM);
  const peZ = conductorImpedance(i.peCsaMm2, i.lengthM);
  const loop = addImpedance(addImpedance(i.sourceZ, phaseZ), peZ);
  const zsOhm = impedanceMagnitude(loop);

  const ia = CURVE_TRIP_MULTIPLE[i.curve] * i.breakerRatingA;
  const zsMaxOhm = ia > 0 ? (ZS_VOLTAGE_FACTOR * NOMINAL_PHASE_VOLTAGE_V) / ia : Infinity;

  // TT clears earth faults via the RCD, not the overcurrent loop — relax the ADS
  // check rather than flagging an (expected) high loop impedance.
  const disconnectsInTime = i.earthingSystem === 'TT' ? true : zsOhm <= zsMaxOhm + 1e-9;

  return {
    zsOhm: round(zsOhm, 3),
    zsMaxOhm: zsMaxOhm === Infinity ? zsMaxOhm : round(zsMaxOhm, 3),
    disconnectsInTime,
  };
}

/**
 * Current-based selectivity (discrimination) ratio rule of thumb: an upstream
 * device discriminates with a downstream one when its rating is at least
 * 1.6x the downstream rating. Full selectivity requires manufacturer let-through
 * / time-current curves; this is a first-pass screen only.
 */
export const SELECTIVITY_RATIO = 1.6;

/** True when an upstream breaker likely does NOT discriminate with a downstream one. */
export function nonSelective(upstreamInA: number, downstreamInA: number): boolean {
  if (downstreamInA <= 0) return false;
  return upstreamInA < SELECTIVITY_RATIO * downstreamInA;
}
