import { STANDARD_BREAKER_RATINGS_A, breakerClassFor, type BreakerCurve } from '../standards/protection';
import { LOAD_DEFAULTS } from '../standards/loads';
import type { LoadKind } from '../types/electrical';
import type { BreakerResult } from '../types/results';

export interface BreakerSelectInput {
  designCurrentA: number;
  loadKind: LoadKind;
  /** Optional cap so the breaker never exceeds the protected cable's ampacity. */
  maxRatingA?: number;
  /**
   * Manual rating override (A): used verbatim instead of auto-sizing, marked
   * `overridden`. Compliance (In ≥ Ib, Iz ≥ In) is checked by the caller's
   * warning pass — the override is honored, never silently corrected.
   */
  overrideA?: number;
}

/** Smallest standard breaker rating that carries the design current (Ib <= In). */
export function selectBreaker({
  designCurrentA,
  loadKind,
  maxRatingA,
  overrideA,
}: BreakerSelectInput): BreakerResult {
  const curve: BreakerCurve = LOAD_DEFAULTS[loadKind].curve;

  if (overrideA !== undefined && overrideA > 0) {
    return { ratingA: overrideA, deviceClass: breakerClassFor(overrideA), curve, overridden: true };
  }

  let chosen = STANDARD_BREAKER_RATINGS_A.find((r) => r >= designCurrentA);
  if (chosen === undefined) chosen = STANDARD_BREAKER_RATINGS_A[STANDARD_BREAKER_RATINGS_A.length - 1]!;

  if (maxRatingA !== undefined && chosen > maxRatingA) {
    const capped = [...STANDARD_BREAKER_RATINGS_A].reverse().find((r) => r <= maxRatingA);
    if (capped !== undefined) chosen = capped;
  }

  return { ratingA: chosen, deviceClass: breakerClassFor(chosen), curve };
}
