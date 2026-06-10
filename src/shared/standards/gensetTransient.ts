/**
 * Reference data for generator-set motor-starting (transient voltage-dip)
 * assessment.
 *
 * When a motor starts across a generating set, the large starting (inrush)
 * current drawn from the alternator produces a momentary terminal-voltage dip.
 * Unlike a stiff utility supply, an alternator has a finite internal source
 * impedance — dominated by its direct-axis sub-transient reactance Xd'' — so the
 * voltage sags in proportion to the starting kVA relative to the genset rating.
 * If the dip is too deep the motor may stall, contactors may drop out, and other
 * loads on the same bus may be disturbed.
 *
 * The figures below are typical design defaults. Confirm Xd'' and the permissible
 * transient dip against the alternator and generator-set datasheets.
 *
 * Standards context:
 * - IEC 60034-1 / IEC 60034-4 — rotating electrical machines: definition and
 *   determination of the direct-axis sub-transient reactance Xd'' of synchronous
 *   alternators.
 * - ISO 8528-5 — reciprocating internal-combustion-engine-driven generating sets,
 *   Part 5 (generating sets): transient voltage-deviation classes and limits for
 *   load acceptance / motor starting.
 */

/**
 * Typical per-unit direct-axis sub-transient reactance Xd'' of a generating-set
 * alternator (on the machine's own kVA base). Real machines fall in roughly
 * 0.12–0.20 pu; 0.15 is a representative mid-range default.
 *
 * @see IEC 60034-4 (determination of synchronous-machine reactances)
 */
export const GENSET_SUBTRANSIENT_REACTANCE_PU = 0.15;

/**
 * Maximum permissible MOMENTARY terminal-voltage dip during motor starting,
 * expressed as a percentage of nominal. 25 % is a common practical limit for
 * starting a motor on a genset; sustained/steady-state running deviation should
 * stay within roughly 10 %.
 *
 * @see ISO 8528-5 (transient voltage-deviation performance classes)
 */
export const MAX_START_VOLTAGE_DIP_PCT = 25;

/**
 * Maximum permissible steady-state (running) voltage deviation, percent. Kept for
 * reference / documentation of the running-vs-momentary distinction.
 *
 * @see ISO 8528-5
 */
export const MAX_RUNNING_VOLTAGE_DIP_PCT = 10;

/**
 * Effective combined motor efficiency × power factor used to convert mechanical
 * shaft power (kW) to electrical apparent power (kVA). A simple ~0.8 default for
 * a general LV induction motor (η·pf ≈ 0.8).
 */
export const MOTOR_KVA_FROM_KW_FACTOR = 0.8;

/**
 * Canonical app starter-type strings. A loose string is accepted everywhere; this
 * union documents the recognised values.
 */
export type StarterTypeLike =
  | 'DOL'
  | 'STAR_DELTA'
  | 'REVERSING'
  | 'SOFT_STARTER'
  | 'VFD'
  | 'ATS'
  | 'PUMP';

/**
 * Starting-kVA as a multiple of the motor's RUNNING (full-load) kVA, by starter
 * method. These capture how each starter limits inrush:
 * - DOL: full across-the-line inrush, ~6× FLC.
 * - STAR_DELTA: star connection draws ~⅓ of the DOL value, ~2–2.5× (2 used).
 * - SOFT_STARTER: current-ramped, ~3×.
 * - VFD: drive limits current to roughly full-load, ~1×.
 * - REVERSING / PUMP / ATS / unknown: treated as DOL (worst case), ~6×.
 *
 * @see IEC 60947-4-1 (LV motor starters) for the basis of these multiples.
 */
const START_KVA_MULTIPLE: Readonly<Record<StarterTypeLike, number>> = {
  DOL: 6,
  STAR_DELTA: 2,
  SOFT_STARTER: 3,
  VFD: 1,
  REVERSING: 6,
  PUMP: 6,
  ATS: 6,
};

/** Fallback multiple for unrecognised starter strings (worst case = DOL). */
const DEFAULT_START_KVA_MULTIPLE = START_KVA_MULTIPLE.DOL;

/**
 * Starting-kVA multiple of motor running kVA for a starter method. Accepts any
 * loose string (case-insensitive); unknown values default to DOL (the worst,
 * most conservative case).
 *
 * @param starterType - one of the app's starter-type strings, or any string.
 * @returns the starting-kVA / running-kVA ratio (dimensionless).
 */
export function startKvaMultiple(starterType?: string): number {
  if (!starterType) return DEFAULT_START_KVA_MULTIPLE;
  const key = starterType.trim().toUpperCase() as StarterTypeLike;
  return START_KVA_MULTIPLE[key] ?? DEFAULT_START_KVA_MULTIPLE;
}

/**
 * Motor running (full-load) apparent power from rated shaft power.
 * kVA ≈ kW / (η·pf) ≈ kW / 0.8.
 *
 * @param kW - rated mechanical shaft power (kW).
 * @returns running apparent power (kVA); 0 for non-positive input.
 */
export function motorRunningKva(kW: number): number {
  if (!(kW > 0)) return 0;
  return kW / MOTOR_KVA_FROM_KW_FACTOR;
}
