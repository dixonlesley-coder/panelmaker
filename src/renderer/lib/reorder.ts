/** Pure helpers for drag-to-reorder of single-line ways (unit-tested). */

/** Move the item at `from` to `to`, returning a new array. */
export function reorderIds(ids: readonly string[], from: number, to: number): string[] {
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Target slot for a way dragged `dx` SVG-units from slot `from`, given uniform
 * slot width `slot` and `count` slots. Clamped to a valid index.
 */
export function dropIndex(from: number, dx: number, slot: number, count: number): number {
  if (count <= 0 || slot <= 0) return from;
  return Math.max(0, Math.min(count - 1, Math.round(from + dx / slot)));
}
