/**
 * Commercial quotation / proposal engine.
 *
 * A standalone pass over a priced material BOM: it derives assembly labor from
 * the BOM via the labor standard, then layers overhead, contingency and profit
 * margin to produce a sell price and a labelled breakdown for the proposal.
 *
 * Pure and side-effect free — the engine never imports DB or DOM code. The
 * caller supplies the consolidated, costed BOM (e.g. from `costSystem` +
 * `consolidateBom`) and the project's quotation settings.
 */

import { assemblyHoursForCategory } from '../standards/labor';
import { STANDARDS_VERSION } from '../standards/version';
import type { QuotationSettings } from '../types/project';
import type { BomLine, QuotationResult } from '../types/results';
import { round } from './util';

/** Default labor rate when the project has not set one (IDR per hour). */
export const DEFAULT_LABOR_RATE_PER_HOUR = 150_000;
/** Default overhead loading on (material + labor), percent. */
export const DEFAULT_OVERHEAD_PCT = 10;
/** Default gross profit margin as a percent of the sell price. */
export const DEFAULT_MARGIN_PCT = 15;
/** Default contingency / risk allowance on (material + labor), percent. */
export const DEFAULT_CONTINGENCY_PCT = 5;

/** Sum the priced line totals of a BOM (unmatched lines contribute nothing). */
function materialOf(lines: BomLine[]): number {
  return lines.reduce(
    (sum, l) => sum + (l.matched && l.lineTotal !== undefined ? l.lineTotal : 0),
    0,
  );
}

/** Total assembly man-hours for a BOM via the labor standard (hours × qty). */
export function laborHoursForBom(lines: BomLine[]): number {
  return lines.reduce((sum, l) => sum + assemblyHoursForCategory(l.category) * l.qty, 0);
}

/** Input to {@link computeQuotation}. */
export interface QuotationInput {
  /** The priced material BOM to quote (consolidated lines recommended). */
  lines: BomLine[];
  /** Quotation settings; any unset field falls back to the module defaults. */
  settings?: QuotationSettings;
}

/**
 * Build a quotation total from a priced BOM and the project's settings.
 *
 * Material is the sum of priced line totals; labor is derived from the BOM via
 * the labor standard at the configured rate; overhead and contingency load the
 * (material + labor) prime cost; margin is taken on the resulting cost base.
 * With every percentage at zero and labor rate zero the grand total equals the
 * bare material subtotal.
 */
export function computeQuotation(input: QuotationInput): QuotationResult {
  const s = input.settings ?? {};
  const laborRatePerHour = s.laborRatePerHour ?? DEFAULT_LABOR_RATE_PER_HOUR;
  const overheadPct = s.overheadPct ?? DEFAULT_OVERHEAD_PCT;
  const marginPct = s.marginPct ?? DEFAULT_MARGIN_PCT;
  const contingencyPct = s.contingencyPct ?? DEFAULT_CONTINGENCY_PCT;
  const currency = s.currency ?? 'IDR';

  const materialSubtotal = round(materialOf(input.lines), 2);
  const laborHours = round(laborHoursForBom(input.lines), 2);
  const laborSubtotal = round(laborHours * laborRatePerHour, 2);

  // Overhead + contingency load the prime (material + labor) cost.
  const primeCost = materialSubtotal + laborSubtotal;
  const overhead = round(primeCost * (overheadPct / 100), 2);
  const contingency = round(primeCost * (contingencyPct / 100), 2);

  // True gross margin: profit as a fraction of the SELL price, so
  // sell = cost / (1 − margin). (Applying cost·(1+margin) would be a *markup* and
  // realise a smaller margin than entered — a "15% margin" would yield ~13%.)
  // Clamp below 100% to keep the result finite.
  const marginBase = round(primeCost + overhead + contingency, 2);
  const marginFraction = Math.min(Math.max(marginPct, 0), 99.9) / 100;
  const grandTotal = round(marginBase / (1 - marginFraction), 2);
  const margin = round(grandTotal - marginBase, 2);

  const sections = [
    { label: 'Material', amount: materialSubtotal },
    { label: 'Labor', amount: laborSubtotal },
    { label: 'Overhead', amount: overhead },
    { label: 'Contingency', amount: contingency },
    { label: 'Margin', amount: margin },
  ];

  return {
    lines: input.lines,
    materialSubtotal,
    laborHours,
    laborSubtotal,
    overhead,
    contingency,
    marginBase,
    margin,
    grandTotal,
    currency,
    settings: { laborRatePerHour, overheadPct, marginPct, contingencyPct },
    sections,
    standardsVersion: STANDARDS_VERSION,
  };
}
