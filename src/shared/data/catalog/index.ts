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
import { parseCsv } from '@shared/io/csv';
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

/* ----------------------------- import (file → DB) -------------------------- */

/** A table as the in-app PDF extractor dumps it (header row + data rows). */
export interface RawTable {
  page: number;
  index?: number;
  header: string[];
  rows: string[][];
}

/** Overrides applied to every row when mapping a PDF table the user is reviewing. */
export interface TableMapDefaults {
  defaultCategory?: PartCategory;
  defaultSeries?: string;
  extraAttributes?: Record<string, unknown>;
}

// Header aliases so a distributor/extractor CSV or a PDF table need not use our
// exact names. norm() strips punctuation so "Cat. No." == "cat no", "In (A)" == "in a".
const SKU_HEADERS = ['sku', 'order code', 'ordercode', 'reference', 'ref', 'cat no', 'catalogue number', 'code'];
const MODEL_HEADERS = ['model', 'description', 'designation'];
const SERIES_HEADERS = ['series', 'range'];
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Map a catalogue column header to a canonical attribute key (so "In (A)" →
// ratingA, "Icu (kA)" → breakingKa) for tables that don't use our names.
const ATTR_ALIASES: { key: string; test: (k: string) => boolean }[] = [
  { key: 'ratingA', test: (k) => /^(in|in a)$/.test(k) || /rating|rated current|nominal current/.test(k) },
  { key: 'poles', test: (k) => /^poles?$/.test(k) || /no of poles?/.test(k) },
  { key: 'curve', test: (k) => /curve|trip/.test(k) },
  { key: 'breakingKa', test: (k) => /icu|icn|breaking/.test(k) || /^ka$/.test(k) },
];

type ColRole = { kind: 'sku' | 'category' | 'series' | 'model' | 'unit' } | { kind: 'attr'; key: string };
function classify(header: string): ColRole {
  const k = norm(header);
  if (SKU_HEADERS.includes(k)) return { kind: 'sku' };
  if (k === 'category') return { kind: 'category' };
  if (SERIES_HEADERS.includes(k)) return { kind: 'series' };
  if (MODEL_HEADERS.includes(k)) return { kind: 'model' };
  if (k === 'unit') return { kind: 'unit' };
  for (const a of ATTR_ALIASES) if (a.test(k)) return { kind: 'attr', key: a.key };
  return { kind: 'attr', key: header.trim() || 'col' };
}

/** Coerce a cell to the right type for its canonical attribute key. */
function coerce(key: string, val: string): unknown {
  if (key === 'ratingA' || key === 'breakingKa') {
    const m = val.match(/(\d+(?:[.,]\d+)?)/);
    return m ? Number(m[1]!.replace(',', '.')) : val;
  }
  if (key === 'poles') {
    const m = val.match(/[1-4]/);
    return m ? Number(m[0]) : val;
  }
  if (key === 'curve') {
    const m = val.toUpperCase().match(/[BCD]/);
    return m ? m[0] : val;
  }
  const num = Number(val);
  return /^-?\d/.test(val) && !Number.isNaN(num) ? num : val;
}

/** Map one header + its data rows to catalogue entries. Empty when no SKU column. */
function rowsToEntries(header: string[], rows: string[][], defaults: TableMapDefaults = {}): CatalogEntry[] {
  const roles = header.map(classify);
  if (!roles.some((r) => r.kind === 'sku')) return [];

  const entries: CatalogEntry[] = [];
  for (const row of rows) {
    if (row.every((c) => (c ?? '').trim() === '')) continue;
    let sku = '';
    let category = defaults.defaultCategory ?? '';
    let series = defaults.defaultSeries ?? '';
    let model = '';
    let unit: string | undefined;
    const attributes: Record<string, unknown> = { ...(defaults.extraAttributes ?? {}) };
    header.forEach((_h, i) => {
      const role = roles[i]!;
      const val = (row[i] ?? '').trim();
      if (val === '') return;
      switch (role.kind) {
        case 'sku': sku = val.replace(/\s+/g, ''); break;
        case 'category': category = val; break;
        case 'series': series = val; break;
        case 'model': model = val; break;
        case 'unit': unit = val; break;
        default: attributes[role.key] = coerce(role.key, val);
      }
    });
    if (!sku) continue;
    entries.push({
      sku,
      category: category as PartCategory,
      series: series || model,
      model: model || series,
      attributes,
      ...(unit ? { unit } : {}),
    });
  }
  return entries;
}

/** Parse a catalogue CSV (headers: sku, category, series, model, + attribute columns). */
function csvToCatalogFile(text: string): CatalogFile {
  const rows = parseCsv(text);
  const header = rows[0];
  const parts = header && rows.length >= 2 ? rowsToEntries(header, rows.slice(1)) : [];
  return { catalogVersion: 'import', manufacturer: 'Schneider Electric', source: 'CSV import', parts };
}

/* PDF ordering tables rarely have a literal "sku" header — the codes sit under
   columns headed like "3P 3D" / "4P 4D", several per row, with the breaking
   capacity in "Icu = … kA" band rows. So for tables we detect order codes by
   CONTENT, read poles from the 3P/4P labels, pair each code with the rating to
   its left, and carry the Icu bands down. */
const ORDER_CODE_RE = /^[A-Z]{1,4}[0-9][A-Z0-9-]{2,}$/i;
function isCodeCell(s: string): boolean {
  const v = s.trim();
  return v.length >= 5 && ORDER_CODE_RE.test(v) && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
}
function isRatingCell(s: string): boolean {
  return /^\d+\s*(?:-\s*\d+)?\s*a$/i.test(s.trim());
}
function ratingFromCell(s: string): number | undefined {
  const t = s.trim();
  if (!/a$/i.test(t)) return undefined; // ends with A — "16 A", "13-16 A", "100-125 A"
  const nums = t.match(/\d+/g);
  return nums && nums.length ? Number(nums[nums.length - 1]) : undefined; // upper bound of a range
}
function kaFromRow(cells: string[]): number | undefined {
  for (const c of cells) {
    const m = c.match(/(\d+(?:[.,]\d+)?)\s*kA/i);
    if (m) return Number(m[1]!.replace(',', '.'));
  }
  return undefined;
}
function polesFromColumn(header: string[], rows: string[][], c: number): number | undefined {
  for (const cell of [header[c] ?? '', ...rows.map((r) => r[c] ?? '')]) {
    if (isCodeCell(cell)) continue; // never read poles out of an order code
    const m = cell.match(/(\d)\s*P\b/i);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** Map one detected table to entries via content-based code/rating detection. */
function tableToEntries(header: string[], rows: string[][], defaults: TableMapDefaults): CatalogEntry[] {
  const width = Math.max(header.length, ...rows.map((r) => r.length), 0);
  const codeCols: number[] = [];
  const ratingCols: number[] = [];
  for (let c = 0; c < width; c++) {
    const cells = rows.map((r) => (r[c] ?? '').trim()).filter((v) => v !== '');
    if (cells.length === 0) continue;
    if (cells.filter(isCodeCell).length / cells.length >= 0.5) {
      codeCols.push(c);
    } else if (norm(header[c] ?? '') === 'rating' || cells.filter(isRatingCell).length / cells.length >= 0.4) {
      ratingCols.push(c);
    }
  }
  if (codeCols.length === 0) return [];

  const polesByCol = new Map(codeCols.map((c) => [c, polesFromColumn(header, rows, c)] as const));
  const nearestRating = (c: number): number | undefined => {
    let best: number | undefined;
    for (const rc of ratingCols) if (rc < c) best = rc;
    return best;
  };

  const category = (defaults.defaultCategory ?? 'breaker') as PartCategory;
  const series = defaults.defaultSeries?.trim() ?? '';
  const out: CatalogEntry[] = [];
  let ctxKa: number | undefined;
  for (const row of rows) {
    const cells = row.map((c) => (c ?? '').trim());
    const codesHere = codeCols.filter((c) => isCodeCell(cells[c] ?? ''));
    if (codesHere.length === 0) {
      const ka = kaFromRow(cells);
      if (ka !== undefined) ctxKa = ka; // "Icu = X kA" band → applies to following rows
      continue;
    }
    for (const c of codesHere) {
      const sku = (cells[c] ?? '').replace(/\s+/g, '');
      const rc = nearestRating(c);
      const ratingA = rc !== undefined ? ratingFromCell(cells[rc] ?? '') : undefined;
      const poles = polesByCol.get(c);
      const attributes: Record<string, unknown> = { ...(defaults.extraAttributes ?? {}) };
      if (ratingA !== undefined) attributes.ratingA = ratingA;
      if (poles !== undefined) attributes.poles = poles;
      if (ctxKa !== undefined) attributes.breakingKa = ctxKa;
      const model = [series || 'Device', poles ? `${poles}P` : '', ratingA ? `${ratingA}A` : '']
        .filter(Boolean)
        .join(' ');
      out.push({ sku, category, series: series || model, model, attributes });
    }
  }
  return out;
}

/**
 * Map the PDF extractor's raw tables to catalogue entries (de-duped by SKU).
 * Tries the header-based mapper first (clean tables with a "Reference"/"sku"
 * column + per-column attributes); falls back to content-based detection for
 * catalogue tables whose codes live under "3P 3D"/"4P 4D" columns.
 * `defaults` carries the user's review choices (category/series the tables omit).
 */
export function tablesToCandidates(tables: RawTable[], defaults: TableMapDefaults = {}): CatalogEntry[] {
  const bySku = new Map<string, CatalogEntry>();
  for (const t of tables) {
    const header = t.header ?? [];
    const rows = t.rows ?? [];
    let entries = rowsToEntries(header, rows, defaults);
    if (entries.length === 0) entries = tableToEntries(header, rows, defaults);
    for (const e of entries) if (!bySku.has(e.sku)) bySku.set(e.sku, e);
  }
  return [...bySku.values()];
}

/** Parse a catalogue file's text as JSON ({…}) or CSV (auto-detected). */
export function parseCatalogText(text: string): CatalogFile {
  return text.trimStart().startsWith('{') ? (JSON.parse(text) as CatalogFile) : csvToCatalogFile(text);
}

/**
 * Import a catalogue file's text (JSON or CSV) into validated {@link Part}s.
 * Never throws — a malformed file is reported as a single issue.
 */
export function importCatalogText(text: string): { parts: Part[]; issues: CatalogIssue[] } {
  try {
    return loadCatalog(parseCatalogText(text));
  } catch (e) {
    return { parts: [], issues: [{ index: -1, sku: '', reason: `could not parse file: ${(e as Error).message}` }] };
  }
}
