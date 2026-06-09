import { describe, it, expect } from 'vitest';
import {
  computeQuotation,
  laborHoursForBom,
  DEFAULT_LABOR_RATE_PER_HOUR,
  DEFAULT_OVERHEAD_PCT,
  DEFAULT_MARGIN_PCT,
  DEFAULT_CONTINGENCY_PCT,
} from '@shared/engine/quotation';
import { assemblyHoursForCategory } from '@shared/standards/labor';
import { STANDARDS_VERSION } from '@shared/standards/version';
import type { BomLine } from '@shared/types/results';

/** A priced material line. */
function priced(category: string, qty: number, unitPrice: number): BomLine {
  return {
    description: `${category} item`,
    category,
    qty,
    unitPrice,
    lineTotal: unitPrice * qty,
    matched: true,
  };
}

/** An unmatched (unpriced) material line. */
function unpriced(category: string, qty: number): BomLine {
  return { description: `${category} item`, category, qty, matched: false };
}

describe('laborHoursForBom', () => {
  it('sums per-category assembly hours scaled by quantity', () => {
    const lines: BomLine[] = [priced('breaker', 3, 100), priced('enclosure', 1, 100)];
    const expected = assemblyHoursForCategory('breaker') * 3 + assemblyHoursForCategory('enclosure') * 1;
    expect(laborHoursForBom(lines)).toBeCloseTo(expected, 6);
  });

  it('scales with device count', () => {
    const one = laborHoursForBom([priced('contactor', 1, 100)]);
    const four = laborHoursForBom([priced('contactor', 4, 100)]);
    expect(four).toBeCloseTo(one * 4, 6);
  });
});

describe('computeQuotation', () => {
  const lines: BomLine[] = [priced('breaker', 2, 200_000), priced('enclosure', 1, 3_000_000)];

  it('returns the bare material subtotal when all percentages and the labor rate are zero', () => {
    const q = computeQuotation({
      lines,
      settings: {
        laborRatePerHour: 0,
        overheadPct: 0,
        marginPct: 0,
        contingencyPct: 0,
      },
    });
    expect(q.materialSubtotal).toBe(3_400_000);
    expect(q.laborSubtotal).toBe(0);
    expect(q.overhead).toBe(0);
    expect(q.contingency).toBe(0);
    expect(q.margin).toBe(0);
    expect(q.grandTotal).toBe(3_400_000);
  });

  it('excludes unmatched lines from the material subtotal but still bills their labor', () => {
    const withUnpriced: BomLine[] = [...lines, unpriced('contactor', 1)];
    const q = computeQuotation({
      lines: withUnpriced,
      settings: { laborRatePerHour: 100_000, overheadPct: 0, marginPct: 0, contingencyPct: 0 },
    });
    expect(q.materialSubtotal).toBe(3_400_000); // unmatched contactor not counted
    // Labor includes the contactor's assembly hours.
    expect(q.laborHours).toBeCloseTo(laborHoursForBom(withUnpriced), 6);
  });

  it('applies overhead and contingency on (material + labor) and margin on the loaded base', () => {
    const q = computeQuotation({
      lines,
      settings: {
        laborRatePerHour: 100_000,
        overheadPct: 10,
        marginPct: 20,
        contingencyPct: 5,
      },
    });
    const material = 3_400_000;
    const labor = laborHoursForBom(lines) * 100_000;
    const prime = material + labor;
    expect(q.overhead).toBeCloseTo(prime * 0.1, 2);
    expect(q.contingency).toBeCloseTo(prime * 0.05, 2);
    const base = prime + q.overhead + q.contingency;
    expect(q.marginBase).toBeCloseTo(base, 2);
    // True gross margin: sell = base / (1 − margin); a 20% margin → base / 0.8.
    expect(q.grandTotal).toBeCloseTo(base / (1 - 0.2), 2);
    expect(q.margin).toBeCloseTo(q.grandTotal - base, 2);
    // The realised profit is 20% of the SELL price.
    expect(q.margin / q.grandTotal).toBeCloseTo(0.2, 4);
  });

  it('uses the documented defaults when settings are absent', () => {
    const q = computeQuotation({ lines });
    expect(q.settings).toEqual({
      laborRatePerHour: DEFAULT_LABOR_RATE_PER_HOUR,
      overheadPct: DEFAULT_OVERHEAD_PCT,
      marginPct: DEFAULT_MARGIN_PCT,
      contingencyPct: DEFAULT_CONTINGENCY_PCT,
    });
    expect(q.currency).toBe('IDR');
    expect(q.grandTotal).toBeGreaterThan(q.materialSubtotal);
  });

  it('builds an ordered section breakdown and stamps the standards version', () => {
    const q = computeQuotation({ lines });
    expect(q.sections.map((s) => s.label)).toEqual([
      'Material',
      'Labor',
      'Overhead',
      'Contingency',
      'Margin',
    ]);
    expect(q.standardsVersion).toBe(STANDARDS_VERSION);
  });
});
