import {
  CONTACTOR_AC3_FRAMES,
  AC4_DERATE_FACTOR,
  STAR_DELTA_WINDING_FACTOR,
  type ContactorFrame,
} from '../../standards/control/contactor';
import type { StartingDuty } from '../../types/control';
import { round } from '../util';

export interface ContactorSelectInput {
  flcA: number;
  /** Star contactor in a star-delta starter -> ~58% line current. */
  isStarWinding?: boolean;
  startingDuty?: StartingDuty;
}

export interface ContactorSelection {
  frame: ContactorFrame;
  ac3A: number;
  kw400: number;
  heatLossW: number;
  /** Current the frame must cover after winding/duty adjustment (A). */
  targetA: number;
  ok: boolean;
}

/** Select the smallest AC-3 frame covering the (adjusted) motor current. */
export function selectContactor({
  flcA,
  isStarWinding = false,
  startingDuty = 'normal',
}: ContactorSelectInput): ContactorSelection {
  const windingFactor = isStarWinding ? STAR_DELTA_WINDING_FACTOR : 1;
  const targetA = flcA * windingFactor;

  // AC-4 (inching/plugging) needs a much larger AC-3 frame.
  const isAc4 = startingDuty === 'jogging';
  const requiredAc3 = isAc4 ? targetA / AC4_DERATE_FACTOR : targetA;

  const frame = CONTACTOR_AC3_FRAMES.find((f) => f.ac3A >= requiredAc3);
  if (!frame) {
    const largest = CONTACTOR_AC3_FRAMES[CONTACTOR_AC3_FRAMES.length - 1]!;
    return {
      frame: largest,
      ac3A: largest.ac3A,
      kw400: largest.kw400,
      heatLossW: largest.heatLossW,
      targetA: round(targetA, 1),
      ok: false,
    };
  }
  return {
    frame,
    ac3A: frame.ac3A,
    kw400: frame.kw400,
    heatLossW: frame.heatLossW,
    targetA: round(targetA, 1),
    ok: true,
  };
}
