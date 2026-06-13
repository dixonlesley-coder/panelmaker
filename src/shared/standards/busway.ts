/**
 * Busbar trunking (busway / busduct) standard continuous current ratings (A).
 *
 * Busway is the standard rising-main between floors of tall commercial/industrial
 * buildings — a feeder alternative to large parallel cables. Ratings follow the
 * common manufacturer ladder (IEC 61439-6); a feeder run as busway is sized to
 * the smallest rating at or above its design current.
 */

export const BUSWAY_RATINGS_A: readonly number[] = [
  160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300,
];

/** Smallest standard busway rating at or above the design current (A). */
export function selectBuswayRating(designCurrentA: number): number {
  return (
    BUSWAY_RATINGS_A.find((r) => r >= designCurrentA) ??
    BUSWAY_RATINGS_A[BUSWAY_RATINGS_A.length - 1]!
  );
}
