/**
 * Generator-set motor-starting transient voltage-dip assessment (pure).
 *
 * Estimates the momentary terminal-voltage dip a generating set suffers when its
 * largest motor starts, and reports whether that dip is within the permissible
 * limit. When it is not, it recommends the smallest genset rating that brings the
 * dip back within limit.
 *
 * Model (simple, conservative closed form):
 *
 *   The starting motor presents a series reactance of (Xd'' · startKva) referred
 *   to the genset base, in series with the alternator's own Xd''-based source. A
 *   first-order voltage-divider estimate of the per-unit dip is:
 *
 *     dip (pu) ≈ (startKva · Xd'') / (genKva + startKva · Xd'')
 *     dipPct   ≈ 100 · dip
 *
 *   where startKva is the motor's starting apparent power and genKva the genset
 *   continuous kVA rating. This deliberately ignores load already on the bus,
 *   cable impedance, and AVR transient response — it is a DESIGN-STAGE SCREEN, not
 *   a full transient stability study.
 *
 * The limiting case is taken as the single LARGEST motor starting against the
 * genset rating (worst per-motor dip).
 *
 * Standards context: IEC 60034-1 / IEC 60034-4 (alternator sub-transient
 * reactance Xd''); ISO 8528-5 (generating-set transient voltage-deviation
 * limits). See `standards/gensetTransient`.
 */

import {
  GENSET_SUBTRANSIENT_REACTANCE_PU,
  MAX_START_VOLTAGE_DIP_PCT,
  motorRunningKva,
  startKvaMultiple,
} from '../standards/gensetTransient';

/** Standards clause cited on the result. */
const GENSET_TRANSIENT_CLAUSE = 'ISO 8528-5 / IEC 60034-4';

/** Round to a fixed number of decimal places (kept local for self-containment). */
function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** A motor that the genset must be able to start. */
export interface GensetMotor {
  /** Optional stable identifier. */
  id?: string;
  /** Optional human-readable name (used as `limitingMotorName`). */
  name?: string;
  /** Rated mechanical shaft power (kW). */
  kW: number;
  /** Starter method (loose string; see `startKvaMultiple`). Defaults to DOL. */
  starterType?: string;
}

/** Outcome of a generator-set motor-starting assessment. */
export interface GensetStartResult {
  /** Genset continuous apparent-power rating assessed (kVA). */
  gensetKva: number;
  /** Name of the motor that produced the worst (limiting) dip, if any. */
  limitingMotorName?: string;
  /** Starting apparent power of the limiting motor (kVA). */
  startingKva: number;
  /** Estimated momentary voltage dip for the limiting motor (% of nominal). */
  estimatedDipPct: number;
  /** True when the estimated dip is within `MAX_START_VOLTAGE_DIP_PCT`. */
  acceptable: boolean;
  /**
   * Smallest genset rating (kVA) that holds the limiting motor's dip within the
   * permissible limit. Equal to or below `gensetKva` when already acceptable.
   */
  recommendedMinGensetKva: number;
  /** Human-readable summary of the assessment. */
  note: string;
  /** Standards clause cited. */
  clause: string;
}

/**
 * Starting apparent power (kVA) of a motor for its starter method.
 * startKva = runningKva(kW) · startKvaMultiple(starterType).
 */
function motorStartingKva(motor: GensetMotor): number {
  return motorRunningKva(motor.kW) * startKvaMultiple(motor.starterType);
}

/**
 * Estimated momentary voltage-dip percentage for a given starting kVA against a
 * genset rating, using the voltage-divider model with Xd'' = the alternator
 * sub-transient reactance.
 */
function estimateDipPct(startKva: number, genKva: number): number {
  if (genKva <= 0) return 100;
  if (startKva <= 0) return 0;
  const z = startKva * GENSET_SUBTRANSIENT_REACTANCE_PU;
  return 100 * (z / (genKva + z));
}

/**
 * Smallest genset rating that keeps the dip from `startKva` within `limitPct`.
 *
 * Solving dipPct = 100·z/(genKva + z) ≤ limit for genKva (with z = startKva·Xd''):
 *   genKva ≥ z · (100 − limit) / limit
 */
function minGensetKvaForDip(startKva: number, limitPct: number): number {
  if (startKva <= 0) return 0;
  if (limitPct <= 0) return Infinity;
  const z = startKva * GENSET_SUBTRANSIENT_REACTANCE_PU;
  return z * ((100 - limitPct) / limitPct);
}

/**
 * Assess whether a generating set can start its motors within the permissible
 * momentary voltage-dip limit.
 *
 * The limiting case is the single largest motor (by starting kVA) starting
 * against the genset rating. With no motors the result is trivially acceptable.
 *
 * @param input.gensetKva - genset continuous apparent-power rating (kVA).
 * @param input.motors    - motors the genset must be able to start.
 * @returns the worst-case dip, acceptability, and a recommended minimum genset.
 */
export function assessGensetStart(input: {
  gensetKva: number;
  motors: GensetMotor[];
}): GensetStartResult {
  const gensetKva = round(input.gensetKva, 2);

  // Consider only motors that draw real starting current.
  const candidates = input.motors.filter((m) => m.kW > 0);

  if (candidates.length === 0) {
    return {
      gensetKva,
      startingKva: 0,
      estimatedDipPct: 0,
      acceptable: true,
      recommendedMinGensetKva: 0,
      note: 'no motors',
      clause: GENSET_TRANSIENT_CLAUSE,
    };
  }

  // Limiting motor = largest starting kVA (worst per-motor dip).
  let limiting = candidates[0]!;
  let limitingStartKva = motorStartingKva(limiting);
  for (let i = 1; i < candidates.length; i++) {
    const m = candidates[i]!;
    const sk = motorStartingKva(m);
    if (sk > limitingStartKva) {
      limiting = m;
      limitingStartKva = sk;
    }
  }

  const estimatedDipPct = round(estimateDipPct(limitingStartKva, gensetKva), 2);
  const acceptable = estimatedDipPct <= MAX_START_VOLTAGE_DIP_PCT;
  const recommendedMinGensetKva = round(
    minGensetKvaForDip(limitingStartKva, MAX_START_VOLTAGE_DIP_PCT),
    2,
  );

  const limitingMotorName = limiting.name ?? limiting.id;

  const who = limitingMotorName ? `"${limitingMotorName}"` : 'the largest motor';
  const note = acceptable
    ? `Starting ${who} (${round(limitingStartKva, 1)} kVA) dips ` +
      `${estimatedDipPct}% on a ${gensetKva} kVA genset — within the ` +
      `${MAX_START_VOLTAGE_DIP_PCT}% limit.`
    : `Starting ${who} (${round(limitingStartKva, 1)} kVA) dips ` +
      `${estimatedDipPct}% on a ${gensetKva} kVA genset — exceeds the ` +
      `${MAX_START_VOLTAGE_DIP_PCT}% limit; use at least ` +
      `${recommendedMinGensetKva} kVA (or a reduced-inrush starter).`;

  return {
    gensetKva,
    limitingMotorName,
    startingKva: round(limitingStartKva, 2),
    estimatedDipPct,
    acceptable,
    recommendedMinGensetKva,
    note,
    clause: GENSET_TRANSIENT_CLAUSE,
  };
}
