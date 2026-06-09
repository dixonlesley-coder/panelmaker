/**
 * Motor starting characteristics by starting method: starting current (× FLC)
 * and starting torque (% of full-load torque). Typical values used to compare
 * DOL / star-delta / soft-starter / VFD.
 */

import type { StarterType } from '../../types/control';

export interface StartingProfile {
  /** Starting current as a multiple of full-load current. */
  startMultiple: number;
  /** Starting torque as a percentage of full-load torque. */
  startTorquePct: number;
  label: string;
}

export const STARTING_PROFILES: Readonly<Record<StarterType, StartingProfile>> = {
  DOL: { startMultiple: 6.5, startTorquePct: 100, label: 'Direct-on-line' },
  STAR_DELTA: { startMultiple: 2.2, startTorquePct: 33, label: 'Star-delta' },
  REVERSING: { startMultiple: 6.5, startTorquePct: 100, label: 'Reversing (DOL)' },
  SOFT_STARTER: { startMultiple: 3, startTorquePct: 40, label: 'Soft starter' },
  VFD: { startMultiple: 1.5, startTorquePct: 100, label: 'VFD / VSD' },
  ATS: { startMultiple: 1, startTorquePct: 0, label: 'ATS (no motor)' },
  PUMP: { startMultiple: 6.5, startTorquePct: 100, label: 'Pump (DOL)' },
};
