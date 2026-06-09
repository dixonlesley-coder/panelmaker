import { describe, it, expect } from 'vitest';
import { bomToCsv, bomToAoa } from '@renderer/lib/bomExport';
import type { BomLine } from '@shared/types/results';

const LINES: BomLine[] = [
  {
    partId: 'p1',
    description: 'MCB 16A curve C — Lights',
    category: 'breaker',
    qty: 2,
    unitPrice: 190000,
    lineTotal: 380000,
    matched: true,
  },
  {
    // Description deliberately contains a comma, a double-quote and a newline
    // to exercise RFC-4180 escaping.
    description: 'Cable NYY 4×16 mm², "PE" run\nto MDP',
    category: 'cable',
    qty: 1,
    matched: false,
  },
];

describe('bomToCsv', () => {
  it('emits a header row with the currency annotation', () => {
    const csv = bomToCsv(LINES, 'IDR');
    const firstLine = csv.split('\r\n')[0];
    expect(firstLine).toBe('Category,Description,Qty,Unit price (IDR),Line total (IDR),Matched');
  });

  it('escapes fields containing commas, quotes and newlines per RFC 4180', () => {
    const csv = bomToCsv(LINES, 'IDR');
    // The whole field is wrapped in quotes, embedded quotes are doubled, and the
    // newline is preserved inside the quoted field.
    expect(csv).toContain('"Cable NYY 4×16 mm², ""PE"" run\nto MDP"');
  });

  it('writes priced lines and leaves unmatched price/total cells empty', () => {
    const csv = bomToCsv(LINES, 'IDR');
    const lines = csv.split('\r\n');
    // Row 1 (after header): priced breaker, qty 2.
    expect(lines[1]).toBe('breaker,MCB 16A curve C — Lights,2,190000,380000,yes');
    // The unmatched cable row has empty unit-price and line-total cells and matched=no.
    expect(lines[2]).toContain('cable,');
    expect(lines[2]).toMatch(/,,,no$/);
  });

  it('appends a grand-total row summing only matched lines', () => {
    const csv = bomToCsv(LINES, 'IDR');
    const last = csv.split('\r\n').at(-1);
    expect(last).toBe(',Grand total,,,380000,');
  });
});

describe('bomToAoa', () => {
  it('yields header + one row per line + a totals row', () => {
    const aoa = bomToAoa(LINES, 'IDR');
    // header + 2 lines + totals row
    expect(aoa).toHaveLength(LINES.length + 2);
    expect(aoa[0]).toEqual([
      'Category',
      'Description',
      'Qty',
      'Unit price (IDR)',
      'Line total (IDR)',
      'Matched',
    ]);
  });

  it('keeps numeric cells numeric (qty/prices) for spreadsheet maths', () => {
    const aoa = bomToAoa(LINES, 'IDR');
    const breakerRow = aoa[1];
    expect(breakerRow?.[2]).toBe(2); // qty stays a number
    expect(breakerRow?.[3]).toBe(190000); // unit price stays a number
    expect(breakerRow?.[4]).toBe(380000); // line total stays a number
  });

  it('leaves unmatched price/total cells as empty strings', () => {
    const aoa = bomToAoa(LINES, 'IDR');
    const cableRow = aoa[2];
    expect(cableRow?.[3]).toBe('');
    expect(cableRow?.[4]).toBe('');
    expect(cableRow?.[5]).toBe('no');
  });

  it('totals row sums only matched line totals as a number', () => {
    const aoa = bomToAoa(LINES, 'IDR');
    const totals = aoa.at(-1);
    expect(totals?.[1]).toBe('Grand total');
    expect(totals?.[4]).toBe(380000);
  });
});
