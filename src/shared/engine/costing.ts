import type { BomLine, CostResult } from '../types/results';
import { round } from './util';

/**
 * Price a bill of materials against a part-id -> unit-price lookup. Lines whose
 * part has no price are kept and counted as unmatched (so the UI can prompt to
 * resolve them) and excluded from the grand total.
 */
export function costBom(
  lines: BomLine[],
  prices: Map<string, number>,
  currency = 'IDR',
): CostResult {
  let grandTotal = 0;
  let unmatchedCount = 0;

  const out: BomLine[] = lines.map((line) => {
    const unit = line.partId ? prices.get(line.partId) : undefined;
    if (unit === undefined) {
      unmatchedCount += 1;
      return { ...line, matched: false };
    }
    const lineTotal = unit * line.qty;
    grandTotal += lineTotal;
    return { ...line, unitPrice: unit, lineTotal: round(lineTotal, 2), matched: true };
  });

  return { lines: out, grandTotal: round(grandTotal, 2), currency, unmatchedCount };
}

/**
 * Consolidate a flat list of BOM lines (e.g. every panel's lines concatenated)
 * into one project-level BOM, summing quantities and line totals for identical
 * items. Lines are grouped by part id when present (so the same catalog part
 * used across panels collapses), otherwise by description+category. The kept
 * description drops the per-circuit suffix (everything after the last " — ") so
 * the same device on different circuits merges into a single orderable line.
 */
export function consolidateBom(lines: BomLine[]): BomLine[] {
  const byKey = new Map<string, BomLine>();
  // Preserve first-seen order so the consolidated BOM reads predictably.
  const order: string[] = [];

  for (const line of lines) {
    // Strip the trailing " — <circuit>" so the merged item is circuit-agnostic.
    const desc = line.description.replace(/\s+—\s+[^—]*$/, '').trimEnd();
    const key = line.partId ?? `${line.category}::${desc}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line, description: desc });
      order.push(key);
      continue;
    }

    existing.qty += line.qty;
    // Re-derive the line total from the (consistent) unit price when both
    // contributing lines were priced; otherwise the line stays unpriced.
    if (existing.matched && line.matched && existing.unitPrice !== undefined) {
      existing.lineTotal = round(existing.unitPrice * existing.qty, 2);
    } else {
      existing.matched = false;
      existing.unitPrice = undefined;
      existing.lineTotal = undefined;
    }
  }

  return order.map((k) => byKey.get(k)!);
}
