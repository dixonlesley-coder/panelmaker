import { STANDARD_SECTIONS_MM2, baseKha } from '../standards/conductors';
import type { CableResult } from '../types/results';
import { round } from './util';

export interface CableSizingInput {
  designCurrentA: number;
  breakerRatingA: number;
  deratingFactor: number;
  /** PUIL minimum section (final circuit 2.5, main/trunk 4). */
  minSectionMm2: number;
}

/** PUIL: conductor KHA must be at least 125% of the design current. */
export const CONTINUOUS_FACTOR = 1.25;

/**
 * Smallest standard section whose derated ampacity satisfies both
 * Iz >= In (protection) and Iz >= 1.25 * Ib (PUIL), respecting the minimum
 * section. Guarantees In <= Iz so breaker/cable are coordinated by construction.
 */
export function sizeCable({
  designCurrentA,
  breakerRatingA,
  deratingFactor,
  minSectionMm2,
}: CableSizingInput): CableResult {
  const izRequired = Math.max(breakerRatingA, CONTINUOUS_FACTOR * designCurrentA);
  const df = deratingFactor > 0 ? deratingFactor : 1;

  for (const section of STANDARD_SECTIONS_MM2) {
    if (section < minSectionMm2) continue;
    const derated = baseKha(section) * df;
    if (derated >= izRequired) {
      return {
        csaMm2: section,
        baseKhaA: baseKha(section),
        deratedIzA: round(derated, 1),
        deratingFactor: round(df, 3),
        appliedRule: `Iz ${round(derated, 1)}A >= max(In ${breakerRatingA}A, 1.25*Ib ${round(
          CONTINUOUS_FACTOR * designCurrentA,
          1,
        )}A)`,
      };
    }
  }

  const largest = STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1]!;
  return {
    csaMm2: largest,
    baseKhaA: baseKha(largest),
    deratedIzA: round(baseKha(largest) * df, 1),
    deratingFactor: round(df, 3),
    appliedRule: 'exceeds-range: largest standard section still below required Iz',
  };
}
