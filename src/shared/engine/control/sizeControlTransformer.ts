import {
  CONTROL_TRANSFORMER_VA,
  CONTROL_TRANSFORMER_MARGIN,
  type CoilBurden,
} from '../../standards/control/controlGear';
import { round } from '../util';

export interface ControlTransformerInput {
  burdens: CoilBurden[];
  /** Extra steady-state burden (pilot lamps, timers, control relays), VA. */
  pilotSealedVA?: number;
}

export interface ControlTransformerSelection {
  requiredVA: number;
  chosenVA: number;
  ok: boolean;
}

/**
 * Size a control transformer: combine steady-state and inrush demand
 * (VA = sqrt(sumSealed^2 + sumInrush^2)), apply margin, round up to a standard
 * rating.
 */
export function sizeControlTransformer({
  burdens,
  pilotSealedVA = 0,
}: ControlTransformerInput): ControlTransformerSelection {
  const sumSealed = burdens.reduce((s, b) => s + b.sealedVA, 0) + pilotSealedVA;
  const sumInrush = burdens.reduce((s, b) => s + b.inrushVA, 0);
  const combined = Math.sqrt(sumSealed * sumSealed + sumInrush * sumInrush);
  const requiredVA = combined * CONTROL_TRANSFORMER_MARGIN;

  const chosen =
    CONTROL_TRANSFORMER_VA.find((va) => va >= requiredVA) ??
    CONTROL_TRANSFORMER_VA[CONTROL_TRANSFORMER_VA.length - 1]!;

  return { requiredVA: round(requiredVA, 1), chosenVA: chosen, ok: chosen >= requiredVA };
}
