import { COPPER_BUSBAR_TABLE, COPPER_CURRENT_DENSITY_A_PER_MM2 } from '../standards/protection';
import type { SystemType } from '../types/electrical';
import type { BusbarResult, BusbarSectionResult } from '../types/results';
import { round } from './util';

/**
 * Smallest standard copper bar whose continuous rating covers the total current.
 * Falls back to a current-density estimate if the load exceeds the table.
 */
export function sizeBusbar(totalCurrentA: number): BusbarResult {
  const match = COPPER_BUSBAR_TABLE.find((b) => b.ampacityA >= totalCurrentA);
  if (match) {
    return {
      widthMm: match.widthMm,
      thicknessMm: match.thicknessMm,
      csaMm2: match.csaMm2,
      ampacityA: match.ampacityA,
      totalCurrentA: round(totalCurrentA, 1),
    };
  }
  const csa = Math.ceil(totalCurrentA / COPPER_CURRENT_DENSITY_A_PER_MM2);
  return {
    widthMm: 0,
    thicknessMm: 0,
    csaMm2: csa,
    ampacityA: round(csa * COPPER_CURRENT_DENSITY_A_PER_MM2, 0),
    totalCurrentA: round(totalCurrentA, 1),
  };
}

/** One outgoing way's loading, for grouping ways onto busbar sections. */
export interface BusbarWayLoad {
  id: string;
  /** This way's design (line) current (A). */
  designCurrentA: number;
  /** True for a 3-phase way (loads all lines); else single-phase on `phase`. */
  threePhase: boolean;
  /** Assigned line for single-phase ways (ignored when `threePhase`). */
  phase: 'L1' | 'L2' | 'L3';
}

export interface SplitBusbarOptions {
  /** Maximum outgoing ways on one section before splitting. */
  maxWays: number;
  /** Maximum continuous current one section carries before splitting (A). */
  maxSectionCurrentA: number;
  /** Panel system — single-phase loads sum on one line; 3-phase use the worst phase. */
  system: SystemType;
}

/** Worst-loaded phase's line current for a group of ways (A). */
function sectionWorstPhaseA(ways: BusbarWayLoad[], system: SystemType): number {
  if (system !== '3ph') {
    return ways.reduce((s, w) => s + w.designCurrentA, 0);
  }
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  for (const w of ways) {
    if (w.threePhase) {
      l1 += w.designCurrentA;
      l2 += w.designCurrentA;
      l3 += w.designCurrentA;
    } else if (w.phase === 'L2') {
      l2 += w.designCurrentA;
    } else if (w.phase === 'L3') {
      l3 += w.designCurrentA;
    } else {
      l1 += w.designCurrentA;
    }
  }
  return Math.max(l1, l2, l3);
}

/**
 * Divide a panel's outgoing ways into busbar sections, each bounded by a maximum
 * way count and a maximum continuous current. Ways are taken in order; a new
 * section starts whenever adding the next way would exceed either cap. Each
 * section is sized for the worst-phase current of the ways it carries. Always
 * returns at least one section (a single empty section for a panel with no ways),
 * so renderers can iterate sections uniformly.
 */
export function splitBusbarSections(
  ways: BusbarWayLoad[],
  opts: SplitBusbarOptions,
): BusbarSectionResult[] {
  const maxWays = Math.max(1, Math.floor(opts.maxWays));
  const sections: BusbarSectionResult[] = [];
  let group: BusbarWayLoad[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const currentA = round(sectionWorstPhaseA(group, opts.system), 1);
    sections.push({
      index: sections.length + 1,
      circuitIds: group.map((w) => w.id),
      ways: group.length,
      sectionCurrentA: currentA,
      busbar: sizeBusbar(currentA),
    });
    group = [];
  };

  for (const w of ways) {
    if (group.length > 0) {
      const overWays = group.length + 1 > maxWays;
      const overCurrent = sectionWorstPhaseA([...group, w], opts.system) > opts.maxSectionCurrentA;
      if (overWays || overCurrent) flush();
    }
    group.push(w);
  }
  flush();

  if (sections.length === 0) {
    sections.push({ index: 1, circuitIds: [], ways: 0, sectionCurrentA: 0, busbar: sizeBusbar(0) });
  }
  return sections;
}
