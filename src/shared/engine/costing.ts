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
