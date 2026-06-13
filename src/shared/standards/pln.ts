/**
 * PLN connected-power ("daya tersambung") reference data.
 *
 * Indonesian utility (PLN) supplies are contracted at standard connected-power
 * steps in volt-amperes, distinct per single- and three-phase service. An
 * engineer sizes the service to the next step at or above the diversified
 * demand and must not exceed the contracted daya. These are the published
 * non-subsidised steps (R/B/I tariffs); verify against the current PLN tariff.
 *
 * Pure data + helpers — no Node/DOM.
 */

/** Single-phase (1φ, 230 V) PLN connected-power steps, VA. */
export const PLN_DAYA_VA_1PH: readonly number[] = [
  450, 900, 1300, 2200, 3500, 4400, 5500, 7700, 11000, 13900,
];

/** Three-phase (3φ, 400 V) PLN connected-power steps, VA. */
export const PLN_DAYA_VA_3PH: readonly number[] = [
  3900, 6600, 10600, 13200, 16500, 23000, 33000, 41500, 53000, 66000, 82500,
  105000, 131000, 147000, 197000, 233000,
];

/** The standard daya steps for a given supply phase. */
export function dayaTiers(phase: 1 | 3): readonly number[] {
  return phase === 1 ? PLN_DAYA_VA_1PH : PLN_DAYA_VA_3PH;
}

/**
 * The smallest standard PLN connected-power step (VA) at or above `demandVa`.
 * Returns the largest published step when the demand exceeds the LV catalogue
 * (the service is then beyond a standard LV daya — an MV connection territory).
 */
export function nextDaya(demandVa: number, phase: 1 | 3): number {
  const tiers = dayaTiers(phase);
  for (const t of tiers) {
    if (t >= demandVa) return t;
  }
  return tiers[tiers.length - 1]!;
}

/** Format a daya step for display, e.g. 23000 → "23,000 VA (23 kVA)". */
export function formatDaya(va: number): string {
  const kva = va / 1000;
  const kvaStr = Number.isInteger(kva) ? `${kva}` : kva.toFixed(1);
  return `${va.toLocaleString('en-US')} VA (${kvaStr} kVA)`;
}
