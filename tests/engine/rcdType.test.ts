import { describe, it, expect } from 'vitest';
import { RCD_TYPE_RANK, recommendedRcdType } from '@shared/standards/rcdType';
import type { RcdType } from '@shared/standards/rcdType';
import { LOAD_KINDS } from '@shared/standards/loads';

describe('recommendedRcdType', () => {
  it('EV charger → Type B (note allows Type A + 6 mA DC RDC-DD)', () => {
    const byKind = recommendedRcdType({ loadKind: 'ev_charger' });
    expect(byKind.type).toBe('B');
    expect(byKind.reason).toMatch(/6 mA DC/);

    // The explicit flag wins even on an unrelated load kind.
    const byFlag = recommendedRcdType({ loadKind: 'general', isEvCharger: true });
    expect(byFlag.type).toBe('B');
  });

  it('VFD-driven motor (hasVfd) → Type B for smooth DC residual current', () => {
    const vfd = recommendedRcdType({ loadKind: 'motor', hasVfd: true });
    expect(vfd.type).toBe('B');
    expect(vfd.reason).toMatch(/DC/);

    // A VFD-driven pump likewise.
    expect(recommendedRcdType({ loadKind: 'pump', hasVfd: true }).type).toBe('B');
  });

  it('general / socket / IT loads → Type A', () => {
    expect(recommendedRcdType({ loadKind: 'general' }).type).toBe('A');
    expect(recommendedRcdType({ loadKind: 'socket' }).type).toBe('A');
    expect(recommendedRcdType({ loadKind: 'ups' }).type).toBe('A');
  });

  it('lighting (resistive) → Type A, never Type AC', () => {
    const lighting = recommendedRcdType({ loadKind: 'lighting' });
    expect(lighting.type).toBe('A');
    expect(lighting.reason).toMatch(/AC/); // reason explains AC is deprecated
  });

  it('a non-VFD motor falls through to the Type A default', () => {
    expect(recommendedRcdType({ loadKind: 'motor' }).type).toBe('A');
  });

  it('never recommends Type AC for ANY load kind / VFD / EV combination', () => {
    const flags: { hasVfd?: boolean; isEvCharger?: boolean }[] = [
      {},
      { hasVfd: true },
      { isEvCharger: true },
      { hasVfd: true, isEvCharger: true },
    ];
    for (const loadKind of LOAD_KINDS) {
      for (const f of flags) {
        const got = recommendedRcdType({ loadKind, ...f });
        expect(got.type).not.toBe('AC');
        // Result is always a valid, non-empty waveform class with a reason.
        expect(['A', 'F', 'B']).toContain(got.type);
        expect(got.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('RCD_TYPE_RANK', () => {
  it('orders waveform capability AC < A < F < B', () => {
    expect(RCD_TYPE_RANK.AC).toBeLessThan(RCD_TYPE_RANK.A);
    expect(RCD_TYPE_RANK.A).toBeLessThan(RCD_TYPE_RANK.F);
    expect(RCD_TYPE_RANK.F).toBeLessThan(RCD_TYPE_RANK.B);
  });

  it('covers every RcdType value exactly once', () => {
    const types: RcdType[] = ['AC', 'A', 'F', 'B'];
    const ranks = types.map((t) => RCD_TYPE_RANK[t]);
    expect(new Set(ranks).size).toBe(types.length);
  });
});
