/**
 * Standard 3-phase squirrel-cage motor full-load current (FLC), IEC 60034-1
 * typical values at 400 V. Actual FLC varies +/-5-10% by manufacturer/design;
 * always verify against the motor nameplate before final selection.
 */

export interface MotorRating {
  /** Rated mechanical power (kW). */
  kw: number;
  /** Approximate full-load current at 400 V, 3-phase (A). */
  flcA400: number;
}

/**
 * Typical single-phase induction-motor efficiency × power-factor product (η·cosφ)
 * by rating — small 1-ph motors are markedly less efficient than 3-ph machines,
 * so FLC must be derived as I = P_shaft / (V · η·cosφ), NOT P_shaft / (V · cosφ).
 * Values are conservative composites of capacitor-start/run motor data.
 */
export const MOTOR_1PH_EFF_TIMES_PF: readonly { kw: number; effPf: number }[] = [
  { kw: 0.18, effPf: 0.5 },
  { kw: 0.37, effPf: 0.54 },
  { kw: 0.55, effPf: 0.57 },
  { kw: 0.75, effPf: 0.6 },
  { kw: 1.1, effPf: 0.62 },
  { kw: 1.5, effPf: 0.65 },
  { kw: 2.2, effPf: 0.68 },
  { kw: 3, effPf: 0.7 },
  { kw: 3.7, effPf: 0.72 },
];

export const MOTOR_FLC_400V: readonly MotorRating[] = [
  { kw: 0.37, flcA400: 1.0 },
  { kw: 0.55, flcA400: 1.5 },
  { kw: 0.75, flcA400: 1.9 },
  { kw: 1.1, flcA400: 2.6 },
  { kw: 1.5, flcA400: 3.5 },
  { kw: 2.2, flcA400: 5.0 },
  { kw: 3, flcA400: 6.6 },
  { kw: 4, flcA400: 8.5 },
  { kw: 5.5, flcA400: 11.5 },
  { kw: 7.5, flcA400: 15.5 },
  { kw: 11, flcA400: 22 },
  { kw: 15, flcA400: 29 },
  { kw: 18.5, flcA400: 35 },
  { kw: 22, flcA400: 42 },
  { kw: 30, flcA400: 56 },
  { kw: 37, flcA400: 68 },
  { kw: 45, flcA400: 83 },
  { kw: 55, flcA400: 100 },
  { kw: 75, flcA400: 135 },
  { kw: 90, flcA400: 162 },
  { kw: 110, flcA400: 196 },
  { kw: 132, flcA400: 233 },
  { kw: 160, flcA400: 282 },
  { kw: 200, flcA400: 350 },
  { kw: 250, flcA400: 435 },
];
