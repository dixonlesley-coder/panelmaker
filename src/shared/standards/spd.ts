/**
 * Surge Protective Device (SPD) reference data, per IEC 61643-11 (product
 * standard for low-voltage SPDs), IEC 60364-5-534 (selection and erection of
 * SPDs) and PUIL 2011 (SNI 0225:2011) §3.20 / §4.4 (overvoltage protection).
 *
 * Pure data + helpers — no Node/DOM dependency. Stamped with
 * {@link STANDARDS_VERSION}, so it is diffable and unit-testable like the rest
 * of the standards layer. The engine (`engine/spd.ts`) reads these constants to
 * recommend an SPD class, rating and connection arrangement for a given supply.
 *
 * Background:
 * - SPDs are classed by the test class they pass:
 *   - **Type 1** — Class I test, characterised by an impulse current `Iimp` with
 *     a 10/350 µs waveform; intended to handle a *partial direct lightning*
 *     current. Required where there is an external Lightning Protection System
 *     (LPS) or a direct-strike / overhead-line exposure at the service origin.
 *   - **Type 2** — Class II test, characterised by a nominal discharge current
 *     `In` and a maximum discharge current `Imax`, both 8/20 µs. The standard
 *     SPD at the main distribution board.
 *   - **Type 3** — Class III test, characterised by an open-circuit voltage
 *     `Uoc` (combination wave). Installed near sensitive equipment / at the end
 *     of long final circuits, always *downstream of and coordinated with* a
 *     Type 2.
 * - `Uc` — maximum continuous operating voltage (L-N). Must be ≥ ~1.1·U0 so it
 *   does not conduct at the highest steady-state voltage. For a 230/400 V TN
 *   system U0 = 230 V → Uc ≥ 253 V, satisfied by the standard 275 V rating.
 * - `Up` — voltage protection level. Must coordinate *below* the equipment rated
 *   impulse withstand voltage `Uw` (overvoltage category II ≈ 2.5 kV for normal
 *   appliances), with a margin (IEC 60364-4-44 §443 / §534): Up ≤ 0.8·Uw is the
 *   classic target. ≤ 1.5 kV is comfortably protective; ≤ 2.5 kV is the upper
 *   acceptable bound at the equipment terminals.
 */

import type { EarthingSystem } from '../types/electrical';
import { STANDARDS_VERSION } from './version';

/** SPD test class / type per IEC 61643-11. */
export type SpdType = 'Type 1' | 'Type 2' | 'Type 3' | 'Type 1+2';

/** Governing clause citations for SPD selection. */
export const SPD_CLAUSE =
  'IEC 61643-11; IEC 60364-5-534 (selection & erection); IEC 60364-4-44 §443; PUIL 2011 (SNI 0225:2011) §3.20';

/**
 * Equipment rated impulse withstand voltage `Uw` by overvoltage category
 * (IEC 60364-4-44 Table 44.4, for a 230/400 V system), in volts. Category II is
 * "current-using equipment" (appliances, electronics) — the protection target
 * for downstream SPD coordination.
 */
export const UW_CATEGORY_V = {
  /** Cat IV: origin of installation (service entrance equipment, meters). */
  IV: 6000,
  /** Cat III: fixed installation / distribution circuits. */
  III: 4000,
  /** Cat II: appliances, current-using equipment — the coordination target. */
  II: 2500,
  /** Cat I: specially protected sensitive electronic equipment. */
  I: 1500,
} as const;

/**
 * Target protection-level bands for `Up` at the equipment terminals (volts).
 * Derived from the cat II withstand `Uw` = 2.5 kV with the §534 0.8 margin: a
 * Up at or below `good` is comfortably protective; up to `acceptable` is the
 * highest tolerable value before a downstream Type 3 / shorter leads are needed.
 */
export const UP_TARGET_V = {
  /** Comfortable protection (≈ 0.6·Uw). */
  good: 1500,
  /** Upper acceptable bound at the equipment (= cat II Uw). */
  acceptable: UW_CATEGORY_V.II,
} as const;

/**
 * Maximum continuous operating voltage `Uc` (L-N), volts. The standard value for
 * a 230/400 V TN system; ≥ 1.1·U0 = 253 V.
 */
export const UC_TN_V = 275;

/**
 * `Uc` for the N-PE protection path in a **TT** (or TN with the SPD upstream of
 * the main RCD) "3+1" arrangement. Here the N-PE component must withstand a
 * temporary overvoltage of √3·U0 ≈ 398 V under a fault, so a higher rating than
 * the 275 V L-N modules is used. 335 V is the common N-PE spark-gap module
 * rating, sitting in the 264–440 V band of available devices.
 */
export const UC_TT_NPE_V = 335;

/** Lower / upper bounds on the TT N-PE Uc band (volts), for validation. */
export const UC_TT_NPE_RANGE_V = { min: 264, max: 440 } as const;

/**
 * Typical / standard ratings by SPD type. Currents in kA, voltages in V.
 * These are representative catalogue values used as the engine's defaults; the
 * ranges document the span of commonly available devices.
 */
export interface SpdTypeRating {
  type: SpdType;
  /** Class I impulse current `Iimp` (10/350 µs), kA per pole. */
  iimpKa?: number;
  /** Range of available `Iimp` per pole (kA). */
  iimpRangeKa?: readonly [number, number];
  /** Class II nominal discharge current `In` (8/20 µs), kA. */
  inKa?: number;
  /** Class II maximum discharge current `Imax` (8/20 µs), kA. */
  imaxKa?: number;
  /** Class III open-circuit voltage `Uoc` (combination wave), kV. */
  uocKv?: number;
  /** Typical voltage protection level `Up` at the device, kV. */
  upKv: number;
}

export const SPD_RATINGS: Readonly<Record<SpdType, SpdTypeRating>> = {
  'Type 1': {
    type: 'Type 1',
    iimpKa: 12.5,
    iimpRangeKa: [12.5, 25],
    upKv: 1.5,
  },
  'Type 2': {
    type: 'Type 2',
    inKa: 20,
    imaxKa: 40,
    upKv: 1.2,
  },
  'Type 3': {
    type: 'Type 3',
    uocKv: 6,
    upKv: 1.0,
  },
  // Combined Type 1+2 device: carries the partial-lightning Iimp of a Type 1
  // while also being characterised by Type 2 In/Imax, so one unit can sit at the
  // origin of an LPS-protected building.
  'Type 1+2': {
    type: 'Type 1+2',
    iimpKa: 12.5,
    iimpRangeKa: [12.5, 25],
    inKa: 20,
    imaxKa: 40,
    upKv: 1.5,
  },
} as const;

/** SPD connection arrangement (IEC 60364-5-534 §534.2). */
export type SpdConnection = 'common-mode' | '3+1';

/** Human description of each connection arrangement. */
export const SPD_CONNECTION_NOTE: Readonly<Record<SpdConnection, string>> = {
  // TN: each line and the neutral are connected to PE via an SPD ("4+0" / CT1),
  // i.e. all modes referenced to the common protective conductor.
  'common-mode':
    'Connect each line (and N where present) to PE via an SPD (common-mode / "4+0" arrangement).',
  // TT (and TN where the SPD is upstream of the main RCD): "3+1" / CT2 — each
  // line to N through a Class-II varistor, and N to PE through a Class-I spark
  // gap, so the higher N-PE temporary overvoltage is handled by the gap and the
  // RCD is not exposed to the SPD's standing leakage.
  '3+1':
    '"3+1" connection: each line → N via a class-II varistor SPD, and N → PE via a class-I spark-gap SPD. This holds the higher N-PE temporary overvoltage off the line modules and keeps the SPD upstream-compatible with the RCD.',
} as const;

/**
 * Pick the SPD `Uc` (L-N) and connection arrangement for an earthing system.
 * TT (and TN-C-S where the N-PE path can see √3·U0 under fault) use the "3+1"
 * connection with a higher N-PE Uc; plain TN-S uses common-mode 275 V modules.
 */
export function ucForEarthing(system: EarthingSystem): {
  ucV: number;
  npeUcV?: number;
  connection: SpdConnection;
} {
  if (system === 'TT') {
    return { ucV: UC_TN_V, npeUcV: UC_TT_NPE_V, connection: '3+1' };
  }
  // TN-S / TN-C-S: line modules to PE, common-mode.
  return { ucV: UC_TN_V, connection: 'common-mode' };
}

/** Classify a `Up` value (kV) against the cat II coordination targets. */
export function ratePup(upKv: number): 'good' | 'acceptable' | 'inadequate' {
  const upV = upKv * 1000;
  if (upV <= UP_TARGET_V.good) return 'good';
  if (upV <= UP_TARGET_V.acceptable) return 'acceptable';
  return 'inadequate';
}

/** Standards-version stamp for SPD reference data. */
export const SPD_STANDARDS_VERSION = STANDARDS_VERSION;
