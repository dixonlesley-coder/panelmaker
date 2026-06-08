import type { Part } from '@shared/types';

/** A raw {key, price} pair extracted from an imported spreadsheet row. */
export interface RawPriceRow {
  key: string;
  price: number;
}

export interface MatchedPrice {
  partId: string;
  model: string;
  manufacturer: string;
  price: number;
}

export interface PricelistMatch {
  matched: MatchedPrice[];
  unmatched: RawPriceRow[];
}

const PRICE_RE = /price|harga|unit|cost|amount|rp/i;
const KEY_RE = /model|sku|part|name|kode|item|desc|type/i;

function isFiniteNumber(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(toNumber(v));
  return false;
}

/** Parse a number from a value that may carry currency formatting ("Rp 1.250.000"). */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  // strip everything but digits, separators and sign, then drop thousands separators
  const cleaned = v.replace(/[^0-9.,-]/g, '');
  // if both separators present, assume '.'/' ' thousands and ',' decimal or vice-versa;
  // for IDR (no decimals typically) just remove separators
  const digitsOnly = cleaned.replace(/[.,]/g, '');
  return Number(digitsOnly);
}

/**
 * Detect the key and price columns from arbitrary spreadsheet rows and extract
 * clean {key, price} pairs. Prefers header names; falls back to the most-numeric
 * column for price and another column for the key.
 */
export function parseRows(rows: Record<string, unknown>[]): RawPriceRow[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  if (cols.length === 0) return [];

  const numericScore = (c: string) => rows.reduce((n, r) => n + (isFiniteNumber(r[c]) ? 1 : 0), 0);
  const priceCol =
    cols.find((c) => PRICE_RE.test(c)) ??
    [...cols].sort((a, b) => numericScore(b) - numericScore(a))[0]!;
  const keyCol = cols.find((c) => KEY_RE.test(c)) ?? cols.find((c) => c !== priceCol) ?? priceCol;

  const out: RawPriceRow[] = [];
  for (const r of rows) {
    const key = String(r[keyCol] ?? '').trim();
    const price = toNumber(r[priceCol]);
    if (key && Number.isFinite(price) && price > 0) out.push({ key, price });
  }
  return out;
}

/** Match raw rows to catalog parts by model (case-insensitive). */
export function matchToParts(rows: RawPriceRow[], parts: Part[]): PricelistMatch {
  const byModel = new Map(parts.map((p) => [p.model.toLowerCase().trim(), p]));
  const matched: MatchedPrice[] = [];
  const unmatched: RawPriceRow[] = [];
  for (const r of rows) {
    const part = byModel.get(r.key.toLowerCase());
    if (part) {
      matched.push({ partId: part.id, model: part.model, manufacturer: part.manufacturer, price: r.price });
    } else {
      unmatched.push(r);
    }
  }
  return { matched, unmatched };
}

/** Build the partId -> price map to merge into the store from matched rows. */
export function pricesFromMatches(matched: MatchedPrice[]): Record<string, number> {
  return Object.fromEntries(matched.map((m) => [m.partId, m.price]));
}
