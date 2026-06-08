/** Small numeric helpers used across the engine. */

/** Round to `dp` decimal places (default 2). */
export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** Round up to the next multiple of `step`. */
export function roundUp(x: number, step: number): number {
  return Math.ceil(x / step) * step;
}

/** Linear interpolation over a numeric-keyed lookup table, clamped at the ends. */
export function interpolateTable(map: Readonly<Record<number, number>>, x: number): number {
  const keys = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return 1;
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (x <= first) return map[first]!;
  if (x >= last) return map[last]!;
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!;
    const hi = keys[i + 1]!;
    if (x >= lo && x <= hi) {
      const ylo = map[lo]!;
      const yhi = map[hi]!;
      const t = (x - lo) / (hi - lo);
      return ylo + t * (yhi - ylo);
    }
  }
  return map[last]!;
}
