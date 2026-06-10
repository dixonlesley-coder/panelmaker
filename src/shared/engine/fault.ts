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
  GENSET_SUSTAINED_FAULT_MULTIPLE,
  NOMINAL_PHASE_VOLTAGE_V,
  PE_ADIABATIC_K_BY_INSULATION,
  PE_FAULT_CLEAR_TIME_S,
  SOURCE_XR_RATIO,
  ZS_FAULT_TEMP_FACTOR,
  ZS_VOLTAGE_FACTOR,
  breakerKa,
} from '../standards/fault';
import type { BreakerCurve } from '../standards/protection';
import type { EarthingSystem, Insulation } from '../types/electrical';
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
 * given line voltage: |Z| = V_LL / (sqrt(3) * Isc). The magnitude is split into
 * R and X using a typical source X/R ratio (transformer/utility-dominated, so
 * X >> R) — |Z| (hence Isc) is preserved, while the small source R is made
 * explicit so the earth-fault loop (Zs) carries a physical, non-zero source R.
 */
export function sourceImpedanceFromIsc(iscA: number, lineVoltageV: number): Impedance {
  if (iscA <= 0) return { rOhm: 0, xOhm: 0 };
  const z = lineVoltageV / (Math.sqrt(3) * iscA);
  // X/R = k ⇒ R = |Z| / √(1+k²), X = k·R, and √(R²+X²) = |Z|.
  const rOhm = z / Math.sqrt(1 + SOURCE_XR_RATIO * SOURCE_XR_RATIO);
  return { rOhm, xOhm: SOURCE_XR_RATIO * rOhm };
}

/**
 * Sustained short-circuit current a standby generator can drive into the main
 * bus (A): ~3× its rated FLC (AVR-forced). This is the ALTERNATE-source fault
 * level — far below the utility's — and the worst case for automatic
 * disconnection: loops verified against the stiff mains may never reach the
 * breaker's magnetic threshold when running on the genset.
 */
export function generatorFaultA(ratingKva: number, lineVoltageV: number): number {
  if (ratingKva <= 0 || lineVoltageV <= 0) return 0;
  const flcA = (ratingKva * 1000) / (Math.sqrt(3) * lineVoltageV);
  return GENSET_SUSTAINED_FAULT_MULTIPLE * flcA;
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
  /** Prospective earth-fault current available at the circuit (A), U0 / Zs. */
  earthFaultA: number;
  /** Minimum PE CSA to survive the fault energy adiabatically (mm²). */
  peMinAdiabaticMm2: number;
  /** True when the PE conductor meets the adiabatic thermal-withstand minimum. */
  peAdiabaticOk: boolean;
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
  /** Equal parallel runs per phase (each with its own PE) — divides the loop Z. */
  runsPerPhase?: number;
  /** Insulation family — picks the PE adiabatic k (PVC 115 / XLPE 143). */
  insulation?: Insulation;
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
  // Evaluate the loop conductor R at the fault temperature (conservative for ADS):
  // a higher Zs is the unfavourable case for guaranteed disconnection. Equal
  // parallel runs (each with its own PE) divide the conductor impedance.
  const runs = i.runsPerPhase !== undefined && i.runsPerPhase > 1 ? i.runsPerPhase : 1;
  const phaseZ0 = conductorImpedance(i.phaseCsaMm2, i.lengthM);
  const peZ0 = conductorImpedance(i.peCsaMm2, i.lengthM);
  const phaseZ = { rOhm: (phaseZ0.rOhm * ZS_FAULT_TEMP_FACTOR) / runs, xOhm: phaseZ0.xOhm / runs };
  const peZ = { rOhm: (peZ0.rOhm * ZS_FAULT_TEMP_FACTOR) / runs, xOhm: peZ0.xOhm / runs };
  const loop = addImpedance(addImpedance(i.sourceZ, phaseZ), peZ);
  const zsOhm = impedanceMagnitude(loop);

  const ia = CURVE_TRIP_MULTIPLE[i.curve] * i.breakerRatingA;
  const zsMaxOhm = ia > 0 ? (ZS_VOLTAGE_FACTOR * NOMINAL_PHASE_VOLTAGE_V) / ia : Infinity;

  // TT clears earth faults via the RCD, not the overcurrent loop — relax the ADS
  // check rather than flagging an (expected) high loop impedance.
  const disconnectsInTime = i.earthingSystem === 'TT' ? true : zsOhm <= zsMaxOhm + 1e-9;

  // Adiabatic thermal withstand of the PE: S ≥ √(I²·t)/k (IEC 60364-5-54
  // §543.1.2). The earth-fault current is U0/Zs; on TT the loop fault current is
  // electrode-limited and cleared by the RCD, so the check is relaxed (as for ADS).
  const earthFaultA = zsOhm > 0 ? NOMINAL_PHASE_VOLTAGE_V / zsOhm : 0;
  // With parallel runs the fault current splits between the per-run PEs, so the
  // adiabatic minimum applies to each run's share.
  const k = PE_ADIABATIC_K_BY_INSULATION[i.insulation ?? 'PVC'];
  const peMinAdiabaticMm2 = ((earthFaultA / runs) * Math.sqrt(PE_FAULT_CLEAR_TIME_S)) / k;
  const peAdiabaticOk =
    i.earthingSystem === 'TT' ? true : i.peCsaMm2 + 1e-9 >= peMinAdiabaticMm2;

  return {
    zsOhm: round(zsOhm, 3),
    zsMaxOhm: zsMaxOhm === Infinity ? zsMaxOhm : round(zsMaxOhm, 3),
    disconnectsInTime,
    earthFaultA: round(earthFaultA, 0),
    peMinAdiabaticMm2: round(peMinAdiabaticMm2, 2),
    peAdiabaticOk,
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
