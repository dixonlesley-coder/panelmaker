import { describe, it, expect } from 'vitest';
import { bomToCsv, bomToAoa } from '@renderer/lib/bomExport';
import { consolidateBom } from '@shared/engine';
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

describe('consolidateBom', () => {
  it('sums quantities and line totals for the same part across panels', () => {
    // Two panels each contributing one MCB on a different circuit (so the
    // per-circuit description suffix differs) plus a shared cable.
    const lines: BomLine[] = [
      {
        partId: 'mcb-c16',
        description: 'MCB 16A — Lights P1',
        category: 'breaker',
        qty: 2,
        unitPrice: 190000,
        lineTotal: 380000,
        matched: true,
      },
      {
        partId: 'mcb-c16',
        description: 'MCB 16A — Sockets P2',
        category: 'breaker',
        qty: 3,
        unitPrice: 190000,
        lineTotal: 570000,
        matched: true,
      },
      {
        partId: 'cable-16',
        description: 'Cable 16 mm² — Feeder P2',
        category: 'cable',
        qty: 1,
        unitPrice: 165000,
        lineTotal: 165000,
        matched: true,
      },
    ];

    const merged = consolidateBom(lines);
    // The two MCB lines collapse into one; the cable stays separate.
    expect(merged).toHaveLength(2);
    const mcb = merged.find((l) => l.partId === 'mcb-c16');
    expect(mcb?.qty).toBe(5);
    expect(mcb?.lineTotal).toBe(950000); // 190000 × 5
    // The circuit-specific suffix is dropped from the consolidated description.
    expect(mcb?.description).toBe('MCB 16A');
  });

  it('groups unmatched lines by description+category and marks the merge unpriced', () => {
    const lines: BomLine[] = [
      { description: 'Busbar set — MDP', category: 'busbar', qty: 1, matched: false },
      { description: 'Busbar set — SDP', category: 'busbar', qty: 2, matched: false },
    ];
    const merged = consolidateBom(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.qty).toBe(3);
    expect(merged[0]?.matched).toBe(false);
    expect(merged[0]?.lineTotal).toBeUndefined();
  });

  it('produces a consolidated total that the export totals row reflects', () => {
    const lines: BomLine[] = [
      {
        partId: 'p',
        description: 'Widget — A',
        category: 'accessory',
        qty: 1,
        unitPrice: 1000,
        lineTotal: 1000,
        matched: true,
      },
      {
        partId: 'p',
        description: 'Widget — B',
        category: 'accessory',
        qty: 4,
        unitPrice: 1000,
        lineTotal: 4000,
        matched: true,
      },
    ];
    const merged = consolidateBom(lines);
    const totals = bomToAoa(merged, 'IDR').at(-1);
    expect(totals?.[4]).toBe(5000);
  });
});
