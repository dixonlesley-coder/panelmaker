/**
 * Pure catalog matcher: map an engine-sized device requirement onto candidate
 * manufacturer product families.
 *
 * Given a device kind (e.g. `'mcb'`) and a required rated current (the breaker /
 * frame / AC-3 current the engine sized), this returns one {@link CatalogMatch}
 * per suitable family — choosing, for each family, the smallest standard rating
 * that is at least the requirement. Optional filters restrict by manufacturer
 * and/or a minimum breaking capacity (Icu/Icn). Results are sorted by
 * manufacturer name for stable presentation.
 *
 * Pure: no Node/DOM, no side effects. Suitable for the parts / costing UI and
 * for headless tests.
 */

import { MANUFACTURER_CATALOG } from '../data/manufacturers';
import type { CatalogDeviceKind, CatalogFamily } from '../data/manufacturers';

/** A single suggested family + the chosen standard rating that satisfies the need. */
export interface CatalogMatch {
  /** The catalog family this suggestion comes from. */
  family: CatalogFamily;
  /** The smallest standard rating (A) in the family that is >= the requirement. */
  ratingA: number;
  /** The family's verification note, surfaced for convenience. */
  note: string;
}

/** Options to narrow a {@link matchCatalog} query. */
export interface MatchCatalogOptions {
  /** Restrict to this manufacturer brand (exact match). */
  manufacturer?: string;
  /** Require the family's `breakingKa` to be at least this many kA. */
  minBreakingKa?: number;
}

/** The smallest value in `ratings` that is >= `required`, or undefined if none. */
function smallestAdequate(ratings: number[], required: number): number | undefined {
  let best: number | undefined;
  for (const r of ratings) {
    if (r >= required && (best === undefined || r < best)) best = r;
  }
  return best;
}

/**
 * Suitable catalog families for a device of `kind` rated for at least
 * `requiredRatingA`, each paired with the smallest adequate standard rating.
 *
 * A family qualifies when it is of the requested kind, optionally matches the
 * `manufacturer` filter, optionally meets the `minBreakingKa` floor, and has at
 * least one standard rating >= `requiredRatingA`. Returns `[]` when nothing
 * qualifies (e.g. an absurdly large requirement). Sorted by manufacturer name,
 * then by series.
 */
export function matchCatalog(
  kind: CatalogDeviceKind,
  requiredRatingA: number,
  opts?: MatchCatalogOptions,
): CatalogMatch[] {
  const manufacturer = opts?.manufacturer;
  const minBreakingKa = opts?.minBreakingKa;

  const matches: CatalogMatch[] = [];
  for (const family of MANUFACTURER_CATALOG) {
    if (family.kind !== kind) continue;
    if (manufacturer !== undefined && family.manufacturer !== manufacturer) continue;
    if (minBreakingKa !== undefined && (family.breakingKa ?? -Infinity) < minBreakingKa) continue;

    const ratingA = smallestAdequate(family.ratingsA, requiredRatingA);
    if (ratingA === undefined) continue;

    matches.push({ family, ratingA, note: family.note });
  }

  matches.sort((a, b) => {
    const byMfr = a.family.manufacturer.localeCompare(b.family.manufacturer);
    return byMfr !== 0 ? byMfr : a.family.series.localeCompare(b.family.series);
  });
  return matches;
}
