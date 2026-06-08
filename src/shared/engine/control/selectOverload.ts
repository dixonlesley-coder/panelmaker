import {
  STAR_DELTA_WINDING_FACTOR,
  overloadTripClassFor,
  type OverloadTripClass,
} from '../../standards/control/contactor';
import type { StartingDuty } from '../../types/control';
import { round } from '../util';

export interface OverloadSelectInput {
  flcA: number;
  /** Overload sits in a delta leg (star-delta) -> set to FLC x 0.58. */
  inStarLeg?: boolean;
  startingDuty?: StartingDuty;
}

export interface OverloadSelection {
  /** Recommended dial setting (A): the motor FLC (or delta-leg current). */
  settingA: number;
  tripClass: OverloadTripClass;
}

/** Overload relay set-point and trip class for a motor. */
export function selectOverload({
  flcA,
  inStarLeg = false,
  startingDuty = 'normal',
}: OverloadSelectInput): OverloadSelection {
  const legFactor = inStarLeg ? STAR_DELTA_WINDING_FACTOR : 1;
  return {
    settingA: round(flcA * legFactor, 1),
    tripClass: overloadTripClassFor(startingDuty),
  };
}
