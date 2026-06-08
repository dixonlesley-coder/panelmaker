/**
 * VFD / VSD reference data. A drive is selected primarily on rated *output*
 * current (>= motor FLC with margin). Heat dissipation ~= rated power x (1 - eff).
 */

export interface VfdRating {
  /** Rated motor power the drive is matched to (kW). */
  kw: number;
  /** Rated continuous output current at 400 V (A). */
  outputA: number;
}

/** Standard 400 V drive ratings, ascending. */
export const VFD_RATINGS_400V: readonly VfdRating[] = [
  { kw: 0.37, outputA: 1.5 },
  { kw: 0.75, outputA: 2.5 },
  { kw: 1.5, outputA: 4.0 },
  { kw: 2.2, outputA: 6.0 },
  { kw: 3.7, outputA: 9.0 },
  { kw: 5.5, outputA: 13 },
  { kw: 7.5, outputA: 17 },
  { kw: 11, outputA: 25 },
  { kw: 15, outputA: 32 },
  { kw: 18.5, outputA: 40 },
  { kw: 22, outputA: 48 },
  { kw: 30, outputA: 65 },
  { kw: 37, outputA: 80 },
  { kw: 45, outputA: 96 },
  { kw: 55, outputA: 115 },
  { kw: 75, outputA: 155 },
  { kw: 90, outputA: 180 },
  { kw: 110, outputA: 225 },
  { kw: 132, outputA: 260 },
  { kw: 160, outputA: 302 },
  { kw: 200, outputA: 370 },
  { kw: 250, outputA: 477 },
];

/** Safety margin of drive output current over motor FLC. */
export const VFD_CURRENT_MARGIN = 1.1;

/** Variable-torque (pumps/fans) drives can size close; constant-torque oversize. */
export type DriveTorqueType = 'variable' | 'constant';

/** Drive efficiency for heat-loss estimation (use conservative 0.96 -> ~4%). */
export const VFD_EFFICIENCY = 0.96;

/** Heat dissipated by a drive at rated load (W) from its rated power (kW). */
export function vfdHeatLossW(ratedKw: number): number {
  return ratedKw * 1000 * (1 - VFD_EFFICIENCY);
}
