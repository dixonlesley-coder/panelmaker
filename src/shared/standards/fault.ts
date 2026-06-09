/**
 * Short-circuit / protection reference data.
 *
 * Prospective fault current (Isc) and the protective-device characteristics
 * needed to verify breaking capacity, earth-fault loop impedance (Zs) and
 * disconnection times, per IEC 60909 (fault levels), IEC 60898 / 60947-2
 * (device ratings) and IEC 60364-4-41 (protection against electric shock).
 */

import type { BreakerClass, BreakerCurve } from './protection';

/**
 * Assumed prospective fault level at the origin of a direct LV (PLN) supply
 * when no transformer impedance is modelled (kA, 3-phase symmetrical). A
 * conservative figure for an urban LV network downstream of the distribution
 * transformer.
 */
export const DEFAULT_LV_UTILITY_FAULT_KA = 16;

/** Nominal line-to-earth (phase) voltage for the LV network (V), U0. */
export const NOMINAL_PHASE_VOLTAGE_V = 230;

/**
 * Fault-circuit factor (Cmin-style) applied to U0 when deriving the maximum
 * permissible earth-fault loop impedance, allowing for voltage depression
 * during the fault (IEC 60364-4-41).
 */
export const ZS_VOLTAGE_FACTOR = 0.95;

/**
 * Magnetic (instantaneous) trip multiple of rated current for each MCB curve
 * (IEC 60898): the current Ia = multiple x In that guarantees fast tripping.
 * MCCB instantaneous settings are typically ~10x and are treated as a 'C'.
 */
export const CURVE_TRIP_MULTIPLE: Readonly<Record<BreakerCurve, number>> = {
  B: 5,
  C: 10,
  D: 20,
};

/**
 * Standard short-circuit breaking capacities (Icu, kA rms symmetrical) offered
 * for each device class. MCBs per IEC 60898 (typ. 6 / 10 kA); MCCBs per
 * IEC 60947-2 across common frame ratings. Ascending.
 */
export const BREAKING_CAPACITY_KA: Readonly<Record<BreakerClass, readonly number[]>> = {
  MCB: [6, 10],
  MCCB: [16, 25, 36, 50, 70],
};

/**
 * Breaking capacity (kA) to specify for a device of the given class and rating:
 * the smallest standard rating that covers `prospectiveKa` when known,
 * otherwise the class maximum. Larger MCCB frames cannot be built with the
 * smallest breaking capacities, so a rating-based floor is applied.
 */
export function breakerKa(ratingA: number, deviceClass: BreakerClass, prospectiveKa?: number): number {
  const options = BREAKING_CAPACITY_KA[deviceClass];
  // Larger frames have a higher minimum economically-available breaking capacity.
  const floorKa = deviceClass === 'MCCB' && ratingA >= 400 ? 36 : 0;
  const candidates = options.filter((k) => k >= floorKa);
  const pool = candidates.length > 0 ? candidates : options;
  const max = pool[pool.length - 1]!;
  if (prospectiveKa === undefined) return max;
  return pool.find((k) => k >= prospectiveKa) ?? max;
}
