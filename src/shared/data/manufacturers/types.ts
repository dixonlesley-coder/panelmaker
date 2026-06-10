/**
 * Manufacturer catalog data shapes (pure TS — no Node/DOM).
 *
 * These types describe a small, curated library of REAL, public manufacturer
 * product LINES / SERIES (trademarks used nominatively) together with STANDARD
 * IEC rating ladders. The dataset is deliberately *representative*: it carries
 * well-known series names and standard rated-current / frame ladders so a
 * designer can map an engine-sized device onto a plausible commercial family,
 * but it intentionally does NOT contain fabricated exact order/catalogue
 * numbers or prices.
 *
 * Every {@link CatalogFamily} therefore sets `representative: true` and carries
 * a `note` reminding the user to verify the exact catalogue number, breaking
 * capacity (Icu/Icn) and price against the manufacturer datasheet before use.
 */

/** The kinds of protective / switching device a catalog family can describe. */
export type CatalogDeviceKind =
  | 'mcb'
  | 'mccb'
  | 'acb'
  | 'contactor'
  | 'overload_relay'
  | 'spd'
  | 'rccb';

/** Manufacturers covered by the curated catalog. */
export type CatalogManufacturer = 'Schneider Electric' | 'ABB' | 'Chint' | 'LS Electric';

/** MCB tripping curve designations (IEC 60898). */
export type McbCurve = 'B' | 'C' | 'D';

/**
 * A single product family / series with its standard rating ladder.
 *
 * A family groups one commercial series (e.g. "Acti9 iC60N") and the standard
 * IEC ratings it is offered in. It is a representative descriptor, not an
 * authoritative price list — see {@link representative} and {@link note}.
 */
export interface CatalogFamily {
  /** Manufacturer brand (nominative use of the trademark). */
  manufacturer: CatalogManufacturer;
  /** Public series / product-line name, e.g. "Acti9 iC60N", "ComPacT NSX". */
  series: string;
  /** Device kind this family provides. */
  kind: CatalogDeviceKind;
  /**
   * Standard rated currents (A) for protection devices, or standard frame
   * sizes (A) for MCCB/ACB, or AC-3 rated currents (A) for contactors.
   * Sorted ascending; the matcher picks the smallest entry that is adequate.
   */
  ratingsA: number[];
  /** Standard pole options offered, e.g. [1, 2, 3, 4]. */
  poles?: number[];
  /**
   * Representative rated breaking capacity for the series (kA): Icu for
   * MCCB/ACB, the rated short-circuit capacity (Icn) for MCBs, or Imax/In for
   * SPDs. This is the well-known/standard tier for the named series — verify
   * the exact value for a specific catalogue number and voltage.
   */
  breakingKa?: number;
  /** Tripping curves offered (MCBs only). */
  curves?: McbCurve[];
  /**
   * Always `true`: this dataset is representative and must be verified against
   * the manufacturer datasheet before being used in a real design.
   */
  representative: true;
  /** Human-readable verification reminder. Never empty. */
  note: string;
  /**
   * Optional documented PUBLIC naming PATTERN for the series (e.g. an order-code
   * prefix such as "A9F …"). This is a naming convention only — it is NOT a
   * complete, fabricated catalogue number. Omit when no public pattern is known.
   */
  orderCodeHint?: string;
}
