import { describe, expect, it } from 'vitest';
import { dropIndex, reorderIds } from '@renderer/lib/reorder';

describe('single-line reorder helpers', () => {
  it('moves an item forward and backward', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderIds(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderIds(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']); // no-op
  });

  it('computes the drop slot from a drag offset, clamped', () => {
    const slot = 76;
    expect(dropIndex(0, 0, slot, 4)).toBe(0); // no move
    expect(dropIndex(0, 80, slot, 4)).toBe(1); // ~one slot right
    expect(dropIndex(0, 200, slot, 4)).toBe(3); // clamped to last
    expect(dropIndex(2, -160, slot, 4)).toBe(0); // two slots left
    expect(dropIndex(0, -50, slot, 4)).toBe(0); // clamped to first
    expect(dropIndex(1, 30, slot, 4)).toBe(1); // < half a slot → stays
  });
});
