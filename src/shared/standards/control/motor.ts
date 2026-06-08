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

export const MOTOR_FLC_400V: readonly MotorRating[] = [
  { kw: 0.37, flcA400: 1.1 },
  { kw: 0.55, flcA400: 1.5 },
  { kw: 0.75, flcA400: 2.0 },
  { kw: 1.1, flcA400: 2.9 },
  { kw: 1.5, flcA400: 4.0 },
  { kw: 2.2, flcA400: 6.0 },
  { kw: 3, flcA400: 8.0 },
  { kw: 4, flcA400: 11 },
  { kw: 5.5, flcA400: 15 },
  { kw: 7.5, flcA400: 20 },
  { kw: 11, flcA400: 30 },
  { kw: 15, flcA400: 41 },
  { kw: 18.5, flcA400: 51 },
  { kw: 22, flcA400: 61 },
  { kw: 30, flcA400: 83 },
  { kw: 37, flcA400: 102 },
  { kw: 45, flcA400: 125 },
  { kw: 55, flcA400: 152 },
  { kw: 75, flcA400: 208 },
  { kw: 90, flcA400: 249 },
  { kw: 110, flcA400: 305 },
  { kw: 132, flcA400: 366 },
  { kw: 160, flcA400: 444 },
  { kw: 200, flcA400: 555 },
  { kw: 250, flcA400: 693 },
];
