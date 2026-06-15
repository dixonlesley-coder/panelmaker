/**
 * Minimum prospective fault current + phase-conductor thermal withstand (pure).
 *
 * Two protection checks that complement the existing 3-phase Isc / earth-fault
 * (Zs / ADS) analysis in {@link ./fault.ts}:
 *
 *   1. MINIMUM prospective fault current — the single-phase line-to-neutral (L-N)
 *      short circuit at a circuit's REMOTE (load) end. This is the *smallest*
 *      fault the breaker must still clear quickly, because the L-N loop spans
 *      both the phase and neutral conductors over the full run, and the breaker's
 *      magnetic/instantaneous element must still see enough current to trip
 *      (IEC 60364-4-43 / IEC 60898 — short-circuit protection at the far end).
 *
 *   2. PHASE-conductor short-circuit thermal withstand — the adiabatic check that
 *      the let-through energy I²·t does not exceed the conductor's k²·S² limit,
 *      i.e. t ≤ (k·S / I)² (IEC 60364-4-43 §434.5.2). The phase conductor uses
 *      the SAME adiabatic k as the PE for a given material/insulation
 *      (IEC 60364-5-54 Table 54.3, reused here as {@link PE_ADIABATIC_K_TABLE}).
 *
 * Pure TS — no Node/DOM deps; reuses the conductor R/X tables and the adiabatic
 * k table from `../standards`.
 */

import {
  CONDUCTOR_X_OHM_PER_KM,
  conductorResistanceOhmPerKm,
} from '../standards/conductors';
import { PE_ADIABATIC_K_TABLE } from '../standards/fault';
import type { BreakerCurve } from '../standards/protection';

/**
 * Minimum prospective fault current (A) for a single-phase line-to-neutral fault
 * at the remote (load) end of a circuit run.
 *
 * The L-N loop traverses BOTH the phase and the neutral conductor over the full
 * length, so its loop resistance is R_phase + R_neutral. For final circuits the
 * neutral is sized equal to the phase, hence R_neutral = R_phase. With equal
 * parallel runs per phase (each with its own neutral), the loop resistance is
 * divided by the number of runs.
 *
 *   Z = sqrt(Rloop² + Xloop²)
 *   Rloop = sourceZ.R + (R_phase + R_neutral)·length    [Ω]
 *   Xloop = sourceZ.X + 2·X·length                       [Ω]
 *   I = U0 / Z                                            [A]
 *
 * `sourceZOhm` is the magnitude of the per-phase source impedance at the circuit's
 * panel bus (treated as resistance here — conservative for the L-N loop, since a
 * larger R lowers I; the source share is small relative to a long thin final run).
 *
 * @returns the minimum L-N fault current in amperes (0 if the loop impedance is 0).
 */
export function minLineNeutralFaultA(opts: {
  u0V: number;
  sourceZOhm?: number;
  csaMm2: number;
  lengthM: number;
  material?: 'Cu' | 'Al';
  runsPerPhase?: number;
}): number {
  const u0V = opts.u0V > 0 ? opts.u0V : 230;
  const material = opts.material ?? 'Cu';
  const runs = opts.runsPerPhase !== undefined && opts.runsPerPhase > 1 ? opts.runsPerPhase : 1;
  const km = opts.lengthM / 1000;

  // Phase and neutral conductor R over the run (neutral CSA == phase for finals).
  const rPerCond = (conductorResistanceOhmPerKm(opts.csaMm2, material) * km) / runs;
  const rLoop = (opts.sourceZOhm ?? 0) + rPerCond + rPerCond;
  // Reactance of the two-conductor loop; the source X is folded into sourceZOhm.
  const xLoop = (2 * CONDUCTOR_X_OHM_PER_KM * km) / runs;

  const z = Math.sqrt(rLoop * rLoop + xLoop * xLoop);
  if (z <= 0) return 0;
  return u0V / z;
}

/**
 * Upper instantaneous-trip threshold current (A) of an MCB: the multiple of In
 * above which the magnetic element is guaranteed to trip instantaneously
 * (IEC 60898 — B: 5×, C: 10×, D: 20×). A fault current at or above this value
 * clears in milliseconds.
 */
export function magneticTripThresholdA(breaker: { ratingA: number; curve: BreakerCurve }): number {
  const multiple = breaker.curve === 'B' ? 5 : breaker.curve === 'C' ? 10 : 20;
  return multiple * breaker.ratingA;
}

/**
 * True when the (minimum) fault current reaches the breaker's instantaneous trip
 * threshold — i.e. the magnetic element clears the far-end short circuit quickly.
 */
export function instantaneousTrips(
  minFaultA: number,
  breaker: { ratingA: number; curve: BreakerCurve },
): boolean {
  return minFaultA + 1e-9 >= magneticTripThresholdA(breaker);
}

/**
 * Phase-conductor short-circuit thermal withstand (adiabatic, IEC 60364-4-43
 * §434.5.2): the conductor survives a fault of `faultA` for at most
 * `maxTimeS = (k·S / I)²` seconds; it is OK when the device's actual clearing
 * time is no greater. `k` comes from {@link PE_ADIABATIC_K_TABLE} for the
 * material/insulation (the phase conductor uses the same k as the PE).
 *
 * @returns `maxTimeS` (the adiabatic limit, s) and `ok` (clearingTimeS ≤ maxTimeS).
 */
export function phaseWithstand(opts: {
  faultA: number;
  clearingTimeS: number;
  csaMm2: number;
  material?: 'Cu' | 'Al';
  insulation?: 'PVC' | 'XLPE';
}): { maxTimeS: number; ok: boolean } {
  const material = opts.material ?? 'Cu';
  const insulation = opts.insulation ?? 'PVC';
  const k = PE_ADIABATIC_K_TABLE[material][insulation];
  if (opts.faultA <= 0) {
    // No fault current ⇒ no thermal stress; the conductor withstands indefinitely.
    return { maxTimeS: Infinity, ok: true };
  }
  const ratio = (k * opts.csaMm2) / opts.faultA;
  const maxTimeS = ratio * ratio;
  return { maxTimeS, ok: opts.clearingTimeS <= maxTimeS + 1e-12 };
}
