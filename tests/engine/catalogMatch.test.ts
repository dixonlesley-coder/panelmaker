import { describe, it, expect } from 'vitest';
import { matchCatalog } from '@shared/engine/catalogMatch';
import {
  MANUFACTURER_CATALOG,
  familiesFor,
  manufacturers,
} from '@shared/data/manufacturers';

describe('manufacturer catalog dataset', () => {
  it('is non-empty and spans multiple manufacturers', () => {
    expect(MANUFACTURER_CATALOG.length).toBeGreaterThan(0);
    expect(manufacturers().length).toBeGreaterThanOrEqual(4);
  });

  it('marks every family representative with a non-empty note and no fabricated price', () => {
    for (const f of MANUFACTURER_CATALOG) {
      expect(f.representative).toBe(true);
      expect(typeof f.note).toBe('string');
      expect(f.note.trim().length).toBeGreaterThan(0);
      // Guard against a fabricated numeric price/SKU leaking into the dataset.
      const bag = f as unknown as Record<string, unknown>;
      expect(bag.price).toBeUndefined();
      expect(bag.priceIdr).toBeUndefined();
      // Ratings ladders must be real numbers.
      expect(f.ratingsA.length).toBeGreaterThan(0);
      for (const r of f.ratingsA) expect(Number.isFinite(r)).toBe(true);
    }
  });

  it('exposes MCB families via the familiesFor helper', () => {
    const mcbs = familiesFor('mcb');
    expect(mcbs.length).toBeGreaterThanOrEqual(4);
    for (const f of mcbs) expect(f.kind).toBe('mcb');
  });
});

describe('matchCatalog', () => {
  it('matches a 40 A MCB across multiple manufacturers, each with ratingA >= 40', () => {
    const matches = matchCatalog('mcb', 40);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const brands = new Set(matches.map((m) => m.family.manufacturer));
    expect(brands.size).toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      expect(m.ratingA).toBeGreaterThanOrEqual(40);
      expect(m.family.kind).toBe('mcb');
      expect(m.note.length).toBeGreaterThan(0);
    }
  });

  it('picks the smallest adequate rating from the ladder', () => {
    const [first] = matchCatalog('mcb', 33);
    expect(first).toBeDefined();
    // Standard ladder jumps 32 -> 40, so 33 A needs the 40 A pole.
    expect(first!.ratingA).toBe(40);
  });

  it('is sorted by manufacturer name', () => {
    const matches = matchCatalog('mcb', 16);
    const names = matches.map((m) => m.family.manufacturer);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('drops low-breaking-capacity families when minBreakingKa is set', () => {
    const all = matchCatalog('mcb', 16);
    const strict = matchCatalog('mcb', 16, { minBreakingKa: 10 });
    expect(strict.length).toBeLessThan(all.length);
    for (const m of strict) expect(m.family.breakingKa ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('honours the manufacturer filter', () => {
    const onlyAbb = matchCatalog('mcb', 25, { manufacturer: 'ABB' });
    expect(onlyAbb.length).toBeGreaterThan(0);
    for (const m of onlyAbb) expect(m.family.manufacturer).toBe('ABB');
  });

  it('returns [] for an absurdly large requirement', () => {
    expect(matchCatalog('mcb', 99999)).toEqual([]);
  });

  it('returns [] for a kind not in the catalog requirement that cannot be met', () => {
    // ACB families are not part of this representative dataset.
    expect(matchCatalog('acb', 1)).toEqual([]);
  });
});
