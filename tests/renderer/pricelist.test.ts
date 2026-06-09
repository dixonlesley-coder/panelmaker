import { describe, it, expect } from 'vitest';
import { parseRows, matchToParts, pricesFromMatches, toNumber } from '@renderer/lib/pricelist';
import { SAMPLE_PARTS } from '@renderer/data/sampleParts';

describe('pricelist import parsing', () => {
  it('parses IDR thousands and decimal-currency values', () => {
    expect(toNumber('Rp 1.250.000')).toBe(1250000); // IDR thousands
    expect(toNumber('420000')).toBe(420000);
    expect(toNumber(185000)).toBe(185000);
    expect(toNumber('1,250.50')).toBeCloseTo(1250.5, 2); // US decimal
    expect(toNumber('1.250,50')).toBeCloseTo(1250.5, 2); // EU decimal
    expect(toNumber('2499.99')).toBeCloseTo(2499.99, 2);
  });

  it('detects key + price columns from labelled rows', () => {
    const rows = [
      { Model: 'iC60N C16', 'Unit Price': 'Rp 190.000' },
      { Model: 'LC1D40A', 'Unit Price': '700000' },
    ];
    const parsed = parseRows(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ key: 'iC60N C16', price: 190000 });
    expect(parsed[1]).toEqual({ key: 'LC1D40A', price: 700000 });
  });

  it('falls back to the most-numeric column for price', () => {
    const rows = [
      { item: 'iC60N C16', harga: 190000 },
      { item: 'LC1D40A', harga: 700000 },
    ];
    const parsed = parseRows(rows);
    expect(parsed[0]?.price).toBe(190000);
  });
});

describe('pricelist matching', () => {
  it('matches rows to catalog parts by model and yields a price map', () => {
    const rows = parseRows([
      { Model: 'iC60N C16', Price: 190000 },
      { Model: 'LC1D40A', Price: 700000 },
      { Model: 'Unknown Part XYZ', Price: 99000 },
    ]);
    const { matched, unmatched } = matchToParts(rows, SAMPLE_PARTS);
    expect(matched.map((m) => m.model)).toContain('iC60N C16');
    expect(matched.map((m) => m.model)).toContain('LC1D40A');
    expect(unmatched).toHaveLength(1);

    const prices = pricesFromMatches(matched);
    expect(prices['mcb-c16']).toBe(190000);
    expect(prices['contactor-40']).toBe(700000);
  });
});
