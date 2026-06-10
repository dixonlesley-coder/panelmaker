import { describe, it, expect } from 'vitest';
import { computePanel } from '@shared/engine';
import {
  sizeBusbar,
  sizeNeutralPeBars,
  splitBusbarSections,
  type BusbarWayLoad,
} from '@shared/engine/busbar';
import { MAX_WAYS_PER_BUSBAR, MAX_BUSBAR_SECTION_CURRENT_A } from '@shared/standards';
import type { CircuitInput, PanelInput } from '@shared/types';

function way(id: string, designCurrentA: number, phase: BusbarWayLoad['phase'] = 'L1'): BusbarWayLoad {
  return { id, designCurrentA, threePhase: false, phase };
}

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function panel(partial: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

describe('sizeBusbar', () => {
  it('picks the smallest standard bar that covers the load', () => {
    const b = sizeBusbar(100);
    expect(b.ampacityA).toBeGreaterThanOrEqual(100);
    expect(b.csaMm2).toBeGreaterThan(0);
  });
});

describe('sizeNeutralPeBars', () => {
  it('sizes a full-size neutral and the IEC PE step', () => {
    // Large phase bar (>35 mm²) ⇒ full neutral, PE = S/2.
    const big = sizeNeutralPeBars(200, 800);
    expect(big.neutralCsaMm2).toBe(200);
    expect(big.neutralAmpacityA).toBe(800);
    expect(big.peCsaMm2).toBe(100);

    // 16 < S ≤ 35 ⇒ PE = 16; small S ⇒ PE = S, floored at 6.
    expect(sizeNeutralPeBars(25, 100).peCsaMm2).toBe(16);
    expect(sizeNeutralPeBars(10, 60).peCsaMm2).toBe(10);
    expect(sizeNeutralPeBars(4, 30).peCsaMm2).toBe(6);
  });

  it('is populated on a computed panel busbar', () => {
    const p = panel({
      id: 'P1',
      name: 'MDP',
      circuits: [branch({ id: 'c1', name: 'Load', loadW: 20000, loadKind: 'general' })],
    });
    const res = computePanel(p, { faultLevelA: 6000 });
    expect(res.busbar.neutralCsaMm2).toBe(res.busbar.csaMm2);
    expect(res.busbar.peCsaMm2).toBeGreaterThanOrEqual(6);
  });
});

describe('splitBusbarSections', () => {
  it('keeps a small panel on a single section', () => {
    const ways = Array.from({ length: 4 }, (_, i) => way(`c${i}`, 10));
    const sections = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: '1ph',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.ways).toBe(4);
    expect(sections[0]!.circuitIds).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('splits by way count once the cap is exceeded', () => {
    const n = MAX_WAYS_PER_BUSBAR * 2 + 1;
    const ways = Array.from({ length: n }, (_, i) => way(`c${i}`, 5));
    const sections = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: 100000, // disable the current cap
      system: '1ph',
    });
    expect(sections).toHaveLength(Math.ceil(n / MAX_WAYS_PER_BUSBAR));
    // No section exceeds the way cap; every way is placed exactly once, in order.
    expect(sections.every((s) => s.ways <= MAX_WAYS_PER_BUSBAR)).toBe(true);
    expect(sections.flatMap((s) => s.circuitIds)).toEqual(ways.map((w) => w.id));
    expect(sections.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('splits by current once a section would exceed the current cap', () => {
    // Each way is 300 A on the same phase → two fit (600), a third would be 900 > 800.
    const ways = Array.from({ length: 5 }, (_, i) => way(`c${i}`, 300));
    const sections = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: 800,
      system: '1ph',
    });
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((s) => s.sectionCurrentA <= 800)).toBe(true);
    // The bar of each section is rated for its own (worst-phase) current.
    expect(sections.every((s) => s.busbar.ampacityA >= s.sectionCurrentA)).toBe(true);
  });

  it('uses worst-phase current on a 3-phase panel (a 3ph way loads all lines)', () => {
    const ways: BusbarWayLoad[] = [
      { id: 'm', designCurrentA: 100, threePhase: true, phase: 'L1' },
      way('a', 40, 'L1'),
      way('b', 40, 'L2'),
    ];
    const [section] = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: '3ph',
    });
    // L1 = 100 + 40 = 140 is the worst phase (L2 = 140 too, L3 = 100).
    expect(section!.sectionCurrentA).toBe(140);
  });

  it('honors a manual break, forcing a new section even under the caps', () => {
    const ways: BusbarWayLoad[] = [
      way('a', 10),
      way('b', 10),
      { ...way('c', 10), breakBefore: true },
      way('d', 10),
    ];
    const sections = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: '1ph',
    });
    expect(sections).toHaveLength(2);
    expect(sections[0]!.circuitIds).toEqual(['a', 'b']);
    expect(sections[1]!.circuitIds).toEqual(['c', 'd']);
    // The section opened by the user-forced break is flagged; the first is not.
    expect(sections[0]!.manualBreak).toBe(false);
    expect(sections[1]!.manualBreak).toBe(true);
  });

  it('treats a break on the very first way as a no-op', () => {
    const sections = splitBusbarSections(
      [{ ...way('a', 10), breakBefore: true }, way('b', 10)],
      { maxWays: MAX_WAYS_PER_BUSBAR, maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A, system: '1ph' },
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.manualBreak).toBe(false);
  });

  it('auto-splits when a section outgrows the largest practical single bar', () => {
    // 3-phase ways at 500 A each: two fit one 1430 A bar (1000), a third (1500) does not.
    const ways: BusbarWayLoad[] = Array.from({ length: 4 }, (_, i) => ({
      id: `m${i}`,
      designCurrentA: 500,
      threePhase: true,
      phase: 'L1',
    }));
    const sections = splitBusbarSections(ways, {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: '3ph',
    });
    expect(sections.length).toBeGreaterThan(1);
    // Every section is carryable by a single standard bar (within the practical cap).
    expect(sections.every((s) => s.sectionCurrentA <= MAX_BUSBAR_SECTION_CURRENT_A)).toBe(true);
  });

  it('always returns at least one (possibly empty) section', () => {
    const sections = splitBusbarSections([], {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: '1ph',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.ways).toBe(0);
  });
});

describe('computePanel busbar sections', () => {
  it('exposes a single section for a small panel', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'Small DB',
        circuits: [
          branch({ id: 'c1', name: 'L1', loadW: 2000, loadKind: 'lighting', isLighting: true }),
          branch({ id: 'c2', name: 'Sockets', loadW: 3000 }),
        ],
      }),
    );
    expect(r.busbarSections).toHaveLength(1);
    expect(r.busbarSections[0]!.circuitIds).toEqual(['c1', 'c2']);
  });

  it('splits a many-way panel into multiple busbar sections covering every branch', () => {
    const circuits = Array.from({ length: MAX_WAYS_PER_BUSBAR + 5 }, (_, i) =>
      branch({ id: `c${i}`, name: `Way ${i}`, loadW: 1500, loadKind: 'lighting', isLighting: true }),
    );
    const r = computePanel(panel({ id: 'P2', name: 'Big DB', circuits }));
    expect(r.busbarSections.length).toBeGreaterThan(1);
    // Every branch appears in exactly one section, and the union equals all circuits.
    const grouped = r.busbarSections.flatMap((s) => s.circuitIds).sort();
    expect(grouped).toEqual(r.circuits.map((c) => c.circuitId).sort());
    // The main bus still reflects the whole panel demand.
    expect(r.busbar.totalCurrentA).toBeCloseTo(r.totalDemandCurrentA, 1);
  });

  it('splits at a circuit flagged with a manual busbar break', () => {
    const r = computePanel(
      panel({
        id: 'P3',
        name: 'Manual split DB',
        circuits: [
          branch({ id: 'c1', name: 'A', loadW: 1500, loadKind: 'lighting', isLighting: true }),
          branch({ id: 'c2', name: 'B', loadW: 1500, loadKind: 'lighting', isLighting: true }),
          branch({
            id: 'c3',
            name: 'C',
            loadW: 1500,
            loadKind: 'lighting',
            isLighting: true,
            busbarBreakBefore: true,
          }),
        ],
      }),
    );
    expect(r.busbarSections).toHaveLength(2);
    expect(r.busbarSections[0]!.circuitIds).toEqual(['c1', 'c2']);
    expect(r.busbarSections[1]!.circuitIds).toEqual(['c3']);
    expect(r.busbarSections[1]!.manualBreak).toBe(true);
  });
});
