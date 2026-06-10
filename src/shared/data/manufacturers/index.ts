/**
 * Aggregated manufacturer catalog (pure TS — no Node/DOM).
 *
 * Combines the four per-manufacturer family lists into a single
 * {@link MANUFACTURER_CATALOG} and exposes light query helpers. The whole
 * dataset is REPRESENTATIVE: every family carries `representative: true` and a
 * verification `note`. It contains standard IEC rating ladders and real public
 * series names, but no fabricated exact order numbers or prices.
 */

import { abb } from './abb';
import { chint } from './chint';
import { ls } from './ls';
import { schneider } from './schneider';
import type { CatalogDeviceKind, CatalogFamily, CatalogManufacturer } from './types';

export type {
  CatalogDeviceKind,
  CatalogFamily,
  CatalogManufacturer,
  McbCurve,
} from './types';

/**
 * The full representative catalog: Schneider Electric, ABB, Chint and LS
 * Electric product families, in that order.
 */
export const MANUFACTURER_CATALOG: CatalogFamily[] = [...schneider, ...abb, ...chint, ...ls];

/** All families of a given device kind, preserving catalog order. */
export function familiesFor(kind: CatalogDeviceKind): CatalogFamily[] {
  return MANUFACTURER_CATALOG.filter((f) => f.kind === kind);
}

/** The distinct manufacturer brands present in the catalog, in first-seen order. */
export function manufacturers(): CatalogManufacturer[] {
  const seen: CatalogManufacturer[] = [];
  for (const f of MANUFACTURER_CATALOG) {
    if (!seen.includes(f.manufacturer)) seen.push(f.manufacturer);
  }
  return seen;
}
