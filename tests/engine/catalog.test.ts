import { describe, expect, it } from 'vitest';
import {
  CATALOG_ISSUES,
  CATALOG_PARTS,
  SCHNEIDER_CATALOG_ISSUES,
  SCHNEIDER_CATALOG_PARTS,
  importCatalogText,
  loadCatalog,
  partsToCatalogFile,
  serializeCatalogJson,
  tablesToCandidates,
  withSchneiderCatalog,
  type CatalogFile,
} from '@shared/data/catalog';
import { PART_CATEGORIES, type Part } from '@shared/types/parts';

describe('manufacturer catalogue', () => {
  it('the committed Schneider dataset has zero validation issues', () => {
    // A non-empty list means the committed JSON has a bad row — the message
    // names the offending sku + reason so the regression is obvious.
    expect(SCHNEIDER_CATALOG_ISSUES).toEqual([]);
  });

  it('every committed dataset (all manufacturers) has zero validation issues', () => {
    expect(CATALOG_ISSUES).toEqual([]);
  });

  it('the merged catalogue has globally-unique SKUs across manufacturers', () => {
    const ids = CATALOG_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every catalogue part is a well-formed Part with a stable SKU id', () => {
    expect(SCHNEIDER_CATALOG_PARTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const p of CATALOG_PARTS) {
      expect(p.id).toBeTruthy();
      expect(ids.has(p.id)).toBe(false); // unique
      ids.add(p.id);
      expect(PART_CATEGORIES).toContain(p.category);
      expect(p.attributes.sku).toBe(p.id); // SKU surfaced in attributes for matching
      expect(p.defaultUnit).toBeTruthy();
    }
  });

  it('rejects malformed rows (bad category, dup sku, bad rating) but keeps good ones', () => {
    const file: CatalogFile = {
      catalogVersion: 'test',
      manufacturer: 'Schneider Electric',
      source: 'test',
      parts: [
        { sku: 'OK1', category: 'breaker', series: 'iC60N', model: 'iC60N C16', attributes: { ratingA: 16, poles: 1, curve: 'C' } },
        { sku: 'OK1', category: 'breaker', series: 'iC60N', model: 'dup', attributes: { ratingA: 16 } }, // dup sku
        { sku: 'BAD2', category: 'frobnicator' as never, series: 'x', model: 'x', attributes: {} }, // bad category
        { sku: 'BAD3', category: 'breaker', series: 'x', model: 'x', attributes: { ratingA: -5 } }, // bad rating
        { sku: 'BAD4', category: 'breaker', series: 'x', model: 'x', attributes: { poles: 5 } }, // bad poles
        { sku: '', category: 'breaker', series: 'x', model: 'x', attributes: {} }, // missing sku
      ],
    };
    const { parts, issues } = loadCatalog(file);
    expect(parts.map((p) => p.id)).toEqual(['OK1']);
    expect(issues).toHaveLength(5);
    expect(issues.map((i) => i.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate'),
        expect.stringContaining('category'),
        expect.stringContaining('ratingA'),
        expect.stringContaining('poles'),
        expect.stringContaining('sku'),
      ]),
    );
  });

  it('exports current parts back to the committed JSON shape and round-trips', () => {
    // The Settings "export catalogue" button: serialize → re-load must be lossless.
    const json = serializeCatalogJson(SCHNEIDER_CATALOG_PARTS);
    const file = JSON.parse(json) as CatalogFile;
    const { parts, issues } = loadCatalog(file);
    expect(issues).toEqual([]);
    expect(new Set(parts.map((p) => p.id))).toEqual(new Set(SCHNEIDER_CATALOG_PARTS.map((p) => p.id)));
    // ratingA/curve survive the round-trip
    const c16 = parts.find((p) => p.id === 'A9F44116');
    expect(c16?.attributes.ratingA).toBe(16);
    expect(c16?.attributes.curve).toBe('C');
  });

  it('export only includes Schneider parts that carry an order code', () => {
    const file = partsToCatalogFile([
      { id: 'A9X1', category: 'breaker', manufacturer: 'Schneider', model: 'iC60N C10', attributes: { sku: 'A9X1', ratingA: 10 }, defaultUnit: 'pcs' },
      { id: 'abb-1', category: 'breaker', manufacturer: 'ABB', model: 'XT1', attributes: { sku: 'ABB123', ratingA: 16 }, defaultUnit: 'pcs' }, // wrong brand
      { id: 'noSku', category: 'cable', manufacturer: 'Schneider', model: 'NYY', attributes: {}, defaultUnit: 'm' }, // no SKU
    ]);
    expect(file.parts.map((p) => p.sku)).toEqual(['A9X1']);
  });

  it('imports a JSON catalogue file', () => {
    const json = JSON.stringify({
      catalogVersion: 'x', manufacturer: 'Schneider Electric', source: 's',
      parts: [{ sku: 'A9F1', category: 'breaker', series: 'iC60N', model: 'iC60N C16', attributes: { ratingA: 16, poles: 1, curve: 'C' } }],
    });
    const { parts, issues } = importCatalogText(json);
    expect(issues).toEqual([]);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.id).toBe('A9F1');
    expect(parts[0]!.attributes.ratingA).toBe(16);
  });

  it('imports a CSV catalogue file (numeric cells coerced, header aliases)', () => {
    const csv = [
      'Order Code,category,series,model,ratingA,poles,curve',
      'A9F44116,breaker,Acti9 iC60N,iC60N 1P C16,16,1,C',
      'LC1D25,contactor,TeSys D,LC1D25 AC-3,,,', // no rating/poles/curve
    ].join('\n');
    const { parts, issues } = importCatalogText(csv);
    expect(issues).toEqual([]);
    expect(parts.map((p) => p.id)).toEqual(['A9F44116', 'LC1D25']);
    expect(parts[0]!.attributes.ratingA).toBe(16); // coerced to number
    expect(parts[0]!.attributes.poles).toBe(1);
    expect(parts[1]!.category).toBe('contactor');
  });

  it('maps PDF-extractor raw tables to candidates (canonical attribute keys + defaults)', () => {
    const tables = [
      {
        page: 120,
        header: ['Reference', 'In (A)', 'No. of poles', 'Curve', 'Icu (kA)'],
        rows: [
          ['A9F44116', '16', '1', 'C', '6'],
          ['A9F44120', '20 A', '1', 'C', '6 kA'],
          ['', '', '', '', ''], // blank spacer row
        ],
      },
    ];
    const candidates = tablesToCandidates(tables, { defaultCategory: 'breaker', defaultSeries: 'Acti9 iC60N' });
    expect(candidates.map((c) => c.sku)).toEqual(['A9F44116', 'A9F44120']);
    expect(candidates[0]!.category).toBe('breaker'); // from default
    expect(candidates[0]!.series).toBe('Acti9 iC60N'); // from default
    expect(candidates[0]!.attributes.ratingA).toBe(16); // "In (A)" → ratingA
    expect(candidates[1]!.attributes.ratingA).toBe(20); // "20 A" coerced
    expect(candidates[0]!.attributes.breakingKa).toBe(6); // "Icu (kA)" → breakingKa
    // and the candidates validate cleanly through the loader
    const { parts, issues } = loadCatalog({ catalogVersion: 'x', manufacturer: 'Schneider Electric', source: 'pdf', parts: candidates });
    expect(issues).toEqual([]);
    expect(parts).toHaveLength(2);
  });

  it('ignores tables with no order-code column', () => {
    const candidates = tablesToCandidates([{ page: 1, header: ['Feature', 'Benefit'], rows: [['a', 'b']] }]);
    expect(candidates).toEqual([]);
  });

  it('handles the GoPact MCCB layout: codes under 3P/4P columns + Icu band rows', () => {
    // Mirrors the real catalogue page: Fixed/Adjustable blocks, each with a
    // Rating column and 3P/4P code columns, and "Icu = N kA" section bands.
    const header = [
      'Rating', '3P 3D', 'Harga (Rp)', 'SS', '4P 4D', 'Harga (Rp)', 'SS',
      'Rating', '3P 3D', 'Harga (Rp)', 'SS', '4P 4D', 'Harga (Rp)', 'SS',
    ];
    const rows = [
      ['Icu = 10 kA at 415 V AC', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['16 A', 'G12T3F16', '772.000', '1', 'G12T4F16', '1.043.000', '2', '13-16 A', 'G12T3A16', '1.103.000', '2', 'G12T4A16', '1.521.000', '2'],
      ['125 A', 'G12T3F125', '947.000', '1', 'G12T4F125', '1.292.000', '2', '100-125 A', 'G12T3A125', '1.275.000', '2', 'G12T4A125', '1.608.000', '2'],
      ['Icu = 30 kA at 415 V AC', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['16 A', 'G12F3F16', '1.018.000', '1', 'G12F4F16', '1.218.000', '2', '13-16 A', 'G12F3A16', '1.227.000', '2', 'G12F4A16', '1.770.000', '2'],
    ];
    const candidates = tablesToCandidates([{ page: 6, header, rows }], { defaultCategory: 'breaker', defaultSeries: 'GoPact MCCB' });
    // 3 data rows × 4 code columns = 12 parts
    expect(candidates).toHaveLength(12);

    const fixed3p = candidates.find((c) => c.sku === 'G12T3F16');
    expect(fixed3p?.attributes).toMatchObject({ ratingA: 16, poles: 3, breakingKa: 10 });
    const adj4p = candidates.find((c) => c.sku === 'G12T4A16');
    expect(adj4p?.attributes).toMatchObject({ ratingA: 16, poles: 4, breakingKa: 10 }); // "13-16 A" → 16
    const band30 = candidates.find((c) => c.sku === 'G12F4A16');
    expect(band30?.attributes.breakingKa).toBe(30); // carried from the 30 kA band
    // all validate through the loader
    const { parts, issues } = loadCatalog({ catalogVersion: 'x', manufacturer: 'Schneider Electric', source: 'pdf', parts: candidates });
    expect(issues).toEqual([]);
    expect(parts).toHaveLength(12);
  });

  it('extracts Indonesian Referensi + Harga + checkmark features (relay page)', () => {
    const header = ['Model', 'Referensi', 'Power Supply Vx', 'DO', 'RS485', 'Front USB', 'Harga (Rp)', 'SS'];
    const rows = [
      ['Model L', 'REL15000', '24-240 VAC/VDC', '4', '-', '-', '11.849.000', '2'],
      ['Model N', 'REL15004', '24-240 VAC/VDC', '6', '✔', '✔', '13.401.000', '2'],
    ];
    const candidates = tablesToCandidates([{ page: 1, header, rows }], { defaultCategory: 'control_relay' });
    expect(candidates.map((c) => c.sku)).toEqual(['REL15000', 'REL15004']);
    expect(candidates[0]!.priceIdr).toBe(11849000); // "11.849.000" → 11849000
    expect(candidates[0]!.attributes.DO).toBe(4);
    expect(candidates[0]!.attributes.RS485).toBeUndefined(); // "-" omitted
    expect(candidates[1]!.attributes.RS485).toBe(true); // "✔" → true
    expect(candidates[1]!.model).toBe('Model N');
    // prices are collected by the loader and routed to the pricelist on import
    const { parts, prices } = loadCatalog({ catalogVersion: 'x', manufacturer: 'Schneider Electric', source: 'pdf', parts: candidates });
    expect(parts).toHaveLength(2);
    expect(prices.REL15000).toBe(11849000);
    expect(prices.REL15004).toBe(13401000);
  });

  it('auto-categorises each table from its page heading (SKU prefix as fallback)', () => {
    const mccb = tablesToCandidates([
      { page: 6, heading: 'GoPact MCCB — Molded Case Circuit Breaker 125', header: ['Rating', 'Referensi', 'Harga (Rp)'], rows: [['16 A', 'LV510347', '1.000.000']] },
    ]);
    expect(mccb[0]!.category).toBe('breaker');

    const relay = tablesToCandidates([
      { page: 4, heading: 'P1F - Feeder Current Protection Relay', header: ['Model', 'Referensi', 'Harga (Rp)'], rows: [['Model L', 'REL15000', '11.849.000']] },
    ]);
    expect(relay[0]!.category).toBe('control_relay');

    const contactor = tablesToCandidates([
      { page: 9, heading: 'TeSys Contactor', header: ['Referensi', 'Harga (Rp)'], rows: [['LC1D25', '500.000']] },
    ]);
    expect(contactor[0]!.category).toBe('contactor');

    // no heading → fall back to the SKU prefix (A9F = Acti9 MCB)
    const byPrefix = tablesToCandidates([{ page: 1, header: ['Referensi', 'Harga (Rp)'], rows: [['A9F44116', '100.000']] }]);
    expect(byPrefix[0]!.category).toBe('breaker');
  });

  it('reports a malformed file as a single issue instead of throwing', () => {
    const { parts, issues } = importCatalogText('{ not valid json');
    expect(parts).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.reason).toContain('could not parse');
  });

  it('merges onto a base list, de-duplicating by SKU (catalogue wins)', () => {
    const base: Part[] = [
      { id: 'sample-c16', category: 'breaker', manufacturer: 'Schneider', model: 'sample', attributes: { sku: 'A9F44116' }, defaultUnit: 'pcs' },
      { id: 'keep-me', category: 'cable', manufacturer: 'Supreme', model: 'NYY', attributes: {}, defaultUnit: 'm' },
    ];
    const merged = withSchneiderCatalog(base);
    // the sample whose sku collides with a catalogue entry is dropped…
    expect(merged.find((p) => p.id === 'sample-c16')).toBeUndefined();
    // …the unrelated part is kept…
    expect(merged.find((p) => p.id === 'keep-me')).toBeDefined();
    // …and the real catalogue entry is present exactly once.
    expect(merged.filter((p) => p.id === 'A9F44116')).toHaveLength(1);
  });
});
