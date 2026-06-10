/**
 * Manufacturer catalogue → parts loader (pure TS — no Node/DOM).
 *
 * The catalogue is a COMMITTED, versioned JSON dataset ({@link ./schneider.parts.json}),
 * produced by `scripts/extract_catalogue.py` from a licensed PDF and reviewed in
 * the PR diff. This module validates it and projects each entry onto the app's
 * {@link Part} shape so it can be:
 *   - seeded into the desktop SQLite catalogue (idempotent, by SKU), and
 *   - merged into the web-preview default catalogue.
 *
 * Nothing here touches SQLite or the DOM, so the same validated parts are shared
 * by the main process, the renderer, and the tests. The SQLite file itself is
 * never committed — only this JSON is.
 */

import { PART_CATEGORIES, type Part, type PartCategory } from '@shared/types/parts';
import schneiderRaw from './schneider.parts.json';

/** One ordering-table row as it appears in the committed JSON. */
export interface CatalogEntry {
  /** Manufacturer order / catalogue code — the unique, stable part id. */
  sku: string;
  category: PartCategory;
  /** Commercial series, e.g. "Acti9 iC60N", "ComPacT NSX". */
  series: string;
  /** Human-readable model description, e.g. "iC60N 3P C32". */
  model: string;
  /** Source page in the catalogue PDF (provenance; optional). */
  page?: number;
  /** Category-specific electrical attributes (ratingA, poles, curve, …). */
  attributes: Record<string, unknown>;
  /** Unit of sale; devices are "pcs" (the default). */
  unit?: string;
}

/** The committed catalogue file shape. */
export interface CatalogFile {
  catalogVersion: string;
  manufacturer: string;
  source: string;
  parts: CatalogEntry[];
}

const CATEGORY_SET: ReadonlySet<string> = new Set(PART_CATEGORIES);

/** A row that failed validation, with the reason (surfaced by the test). */
export interface CatalogIssue {
  index: number;
  sku: string;
  reason: string;
}

/**
 * Validate every entry against the part schema and the standard engineering
 * ladders. Returns the parts that passed plus a list of issues; callers use the
 * parts at runtime (so a bad row can never crash the app) while the unit test
 * asserts `issues` is empty (so a bad row can never be committed).
 */
export function loadCatalog(file: CatalogFile): { parts: Part[]; issues: CatalogIssue[] } {
  const parts: Part[] = [];
  const issues: CatalogIssue[] = [];
  const seen = new Set<string>();

  file.parts.forEach((e, index) => {
    const fail = (reason: string) => issues.push({ index, sku: e.sku ?? '?', reason });

    if (typeof e.sku !== 'string' || e.sku.trim() === '') return fail('missing sku');
    if (seen.has(e.sku)) return fail(`duplicate sku "${e.sku}"`);
    if (!CATEGORY_SET.has(e.category)) return fail(`unknown category "${e.category}"`);
    if (typeof e.model !== 'string' || e.model.trim() === '') return fail('missing model');
    if (e.attributes === null || typeof e.attributes !== 'object') return fail('attributes not an object');

    const a = e.attributes as Record<string, unknown>;
    // Rating: required for protective/switching gear; must be a positive number.
    if (a.ratingA !== undefined && !(typeof a.ratingA === 'number' && a.ratingA > 0)) {
      return fail('ratingA must be a positive number');
    }
    if (a.poles !== undefined && ![1, 2, 3, 4].includes(a.poles as number)) {
      return fail(`poles must be 1–4 (got ${String(a.poles)})`);
    }
    if (a.curve !== undefined && !['B', 'C', 'D'].includes(a.curve as string)) {
      return fail(`curve must be B/C/D (got ${String(a.curve)})`);
    }
    if (a.breakingKa !== undefined && !(typeof a.breakingKa === 'number' && a.breakingKa > 0)) {
      return fail('breakingKa must be a positive number');
    }

    seen.add(e.sku);
    parts.push({
      id: e.sku,
      category: e.category,
      manufacturer: 'Schneider',
      model: e.model,
      attributes: { ...a, sku: e.sku, series: e.series },
      defaultUnit: e.unit ?? 'pcs',
    });
  });

  return { parts, issues };
}

const schneiderFile = schneiderRaw as unknown as CatalogFile;
const schneider = loadCatalog(schneiderFile);

/** Catalogue dataset version (bumped when the JSON is regenerated). */
export const SCHNEIDER_CATALOG_VERSION = schneiderFile.catalogVersion;

/** The validated Schneider catalogue as ready-to-seed {@link Part}s. */
export const SCHNEIDER_CATALOG_PARTS: readonly Part[] = schneider.parts;

/** Validation issues in the committed dataset — asserted empty by the test. */
export const SCHNEIDER_CATALOG_ISSUES: readonly CatalogIssue[] = schneider.issues;

/**
 * Merge the catalogue onto a base parts list, de-duplicating by SKU so the
 * illustrative sample parts don't double up with their catalogue equivalents.
 * The catalogue entry wins.
 */
export function withSchneiderCatalog(base: readonly Part[]): Part[] {
  const catalogSkus = new Set(SCHNEIDER_CATALOG_PARTS.map((p) => p.id));
  const filtered = base.filter((p) => {
    const sku = typeof p.attributes.sku === 'string' ? p.attributes.sku : p.id;
    return !catalogSkus.has(sku) && !catalogSkus.has(p.id);
  });
  return [...filtered, ...SCHNEIDER_CATALOG_PARTS];
}

/* --------------------------- export (DB → git JSON) ------------------------ */

export interface SerializeOpts {
  catalogVersion?: string;
  source?: string;
}

const DEFAULT_EXPORT_SOURCE =
  'Exported from the in-app parts catalogue. Verify every order code / rating against the manufacturer datasheet before use.';

/**
 * Project the current Schneider parts (those carrying an order code) back to the
 * committed {@link CatalogFile} shape — the inverse of {@link loadCatalog}. This
 * is what the Settings "export catalogue" button writes, so it can be committed
 * to git and seeded into every install. Deterministic order → clean PR diffs.
 */
export function partsToCatalogFile(parts: readonly Part[], opts: SerializeOpts = {}): CatalogFile {
  const bySku = new Map<string, CatalogEntry>();
  for (const p of parts) {
    const sku = typeof p.attributes.sku === 'string' ? p.attributes.sku.trim() : '';
    if (!sku) continue; // only real catalogue entries (with an order code)
    if (!p.manufacturer.toLowerCase().includes('schneider')) continue;

    const series = typeof p.attributes.series === 'string' ? p.attributes.series : p.model;
    const attributes: Record<string, unknown> = { ...p.attributes };
    delete attributes.sku; // redundant — it's the id
    delete attributes.series; // promoted to its own field

    bySku.set(sku, { sku, category: p.category, series, model: p.model, attributes });
  }

  const entries = [...bySku.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.series.localeCompare(b.series) ||
      (((a.attributes.ratingA as number) ?? 0) - ((b.attributes.ratingA as number) ?? 0)) ||
      a.sku.localeCompare(b.sku),
  );

  return {
    catalogVersion: opts.catalogVersion ?? `schneider-${new Date().toISOString().slice(0, 10)}`,
    manufacturer: 'Schneider Electric',
    source: opts.source ?? DEFAULT_EXPORT_SOURCE,
    parts: entries,
  };
}

/** Serialize the current parts to the exact committed JSON text (trailing newline). */
export function serializeCatalogJson(parts: readonly Part[], opts: SerializeOpts = {}): string {
  return JSON.stringify(partsToCatalogFile(parts, opts), null, 2) + '\n';
}
