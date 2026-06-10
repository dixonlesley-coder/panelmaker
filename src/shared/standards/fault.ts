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
 * X/R ratio of the equivalent source impedance behind the LV bus. The source is
 * transformer/utility-dominated and largely reactive, so X/R is high (~7 for an
 * LV network per IEC 60909 typical values). Used to split the source |Z| derived
 * from the prospective Isc into R and X components (the magnitude is preserved,
 * so Isc is unchanged; only the R/X share — which matters for the earth-fault
 * loop — becomes physical instead of a pure reactance).
 */
export const SOURCE_XR_RATIO = 7;

/**
 * Adiabatic constant k for a protective (PE) conductor (A·s^½/mm²), copper with
 * PVC insulation as a core of a cable / bunched, 70 °C initial — IEC 60364-5-54
 * Table 54.3. The PE must satisfy S ≥ √(I²·t)/k to survive the earth-fault
 * energy let-through (IEC 60364-5-54 §543.1.2).
 */
export const PE_ADIABATIC_K = 115;

/**
 * Adiabatic k by conductor material and insulation family (IEC 60364-5-54
 * Table 54.3, PE as a core of the cable): Cu/PVC 115, Cu/XLPE 143,
 * Al/PVC 76, Al/XLPE 94.
 */
export const PE_ADIABATIC_K_TABLE: Readonly<
  Record<'Cu' | 'Al', Readonly<Record<'PVC' | 'XLPE', number>>>
> = {
  Cu: { PVC: 115, XLPE: 143 },
  Al: { PVC: 76, XLPE: 94 },
};

/** Back-compat copper view of {@link PE_ADIABATIC_K_TABLE}. */
export const PE_ADIABATIC_K_BY_INSULATION: Readonly<Record<'PVC' | 'XLPE', number>> =
  PE_ADIABATIC_K_TABLE.Cu;

/**
 * Typical sustained (AVR-forced) short-circuit capability of a standby
 * generator, as a multiple of its rated full-load current. Subtransient current
 * decays within cycles; what a breaker's magnetic element actually sees on a
 * genset is ~3× FLC — the worst case for automatic disconnection (ADS), since
 * loops sized for the stiff utility source may never reach the trip threshold.
 */
export const GENSET_SUSTAINED_FAULT_MULTIPLE = 3;

/**
 * Representative protective-device clearing time (s) used for the PE adiabatic
 * thermal-withstand check. An earth fault above the magnetic-trip threshold
 * clears effectively instantaneously; 0.1 s is the conservative lower-bound of
 * the adiabatic method's validity range (IEC 60364-4-43 Annex), so it bounds the
 * let-through energy without needing the device's i²t curve.
 */
export const PE_FAULT_CLEAR_TIME_S = 0.1;

/**
 * Fault-circuit factor (Cmin-style) applied to U0 when deriving the maximum
 * permissible earth-fault loop impedance, allowing for voltage depression
 * during the fault (IEC 60364-4-41).
 */
export const ZS_VOLTAGE_FACTOR = 0.95;

/**
 * Conductor resistance rises with temperature. For the worst-case earth-fault
 * loop (ADS) the loop R must be evaluated near the conductor's fault temperature,
 * not the ~70 °C value tabulated for voltage drop — a higher Zs is the
 * unfavourable case for disconnection. ~1.28× lifts the 70 °C R toward the PVC
 * fault limit (~160 °C), making the Zs / disconnection check conservative
 * (IEC 60364-4-41 / IEC 60909 temperature correction).
 */
export const ZS_FAULT_TEMP_FACTOR = 1.28;

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
 * Lower bound of the magnetic (instantaneous) trip band — the multiple of In
 * below which an MCB is guaranteed NOT to trip instantaneously (IEC 60898:
 * B 3-5×, C 5-10×, D 10-20×). For selectivity this is the current up to which an
 * upstream device stays out of its instantaneous region while a downstream device
 * clears — i.e. the ceiling of guaranteed short-circuit discrimination.
 */
export const CURVE_TRIP_MULTIPLE_LOWER: Readonly<Record<BreakerCurve, number>> = {
  B: 3,
  C: 5,
  D: 10,
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
