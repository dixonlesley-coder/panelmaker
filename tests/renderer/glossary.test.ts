import { describe, it, expect } from 'vitest';
import { GLOSSARY, glossaryLookup } from '@renderer/lib/glossary';

describe('glossary', () => {
  it('is non-empty', () => {
    expect(Object.keys(GLOSSARY).length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty term and plain explanation', () => {
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.trim(), `term for ${id}`).not.toBe('');
      expect(entry.plain.trim(), `plain for ${id}`).not.toBe('');
      // plainId is optional, but when present it must not be blank.
      if (entry.plainId !== undefined) {
        expect(entry.plainId.trim(), `plainId for ${id}`).not.toBe('');
      }
    }
  });

  it('glossaryLookup returns a known entry', () => {
    const zs = glossaryLookup('zs');
    expect(zs).toBeDefined();
    expect(zs).toBe(GLOSSARY.zs);
    expect(zs?.plain).toMatch(/earth fault/i);
  });

  it('glossaryLookup returns undefined for an unknown id', () => {
    expect(glossaryLookup('not-a-real-term')).toBeUndefined();
  });
});
