import { describe, expect, it } from 'vitest';
import {
  SCHNEIDER_CATALOG_ISSUES,
  SCHNEIDER_CATALOG_PARTS,
  loadCatalog,
  partsToCatalogFile,
  serializeCatalogJson,
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

  it('every catalogue part is a well-formed Part with a stable SKU id', () => {
    expect(SCHNEIDER_CATALOG_PARTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const p of SCHNEIDER_CATALOG_PARTS) {
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
