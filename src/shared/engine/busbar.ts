import { COPPER_BUSBAR_TABLE, COPPER_CURRENT_DENSITY_A_PER_MM2 } from '../standards/protection';
import type { SystemType } from '../types/electrical';
import type { BusbarResult, BusbarSectionResult } from '../types/results';
import { round } from './util';

/**
 * Smallest standard copper bar whose continuous rating covers the total current.
 * Falls back to a current-density estimate if the load exceeds the table.
 *
 * `minAmpacityA` floors the bar's rating independently of the carried current —
 * IEC 61439-1 requires the main bus to be rated for the incoming device's rated
 * current (In), not just today's demand, so the incomer can't cook the bar.
 *
 * `minCsaMm2` floors the bar's cross-section so it also meets the short-circuit
 * withstand (Icw) the prospective fault demands — the bus grows to survive the
 * fault instead of merely being flagged inadequate.
 */
export function sizeBusbar(totalCurrentA: number, minAmpacityA = 0, minCsaMm2 = 0): BusbarResult {
  const requiredA = Math.max(totalCurrentA, minAmpacityA);
  const match = COPPER_BUSBAR_TABLE.find((b) => b.ampacityA >= requiredA && b.csaMm2 >= minCsaMm2);
  if (match) {
    return {
      widthMm: match.widthMm,
      thicknessMm: match.thicknessMm,
      csaMm2: match.csaMm2,
      ampacityA: match.ampacityA,
      totalCurrentA: round(totalCurrentA, 1),
    };
  }
  const csa = Math.max(Math.ceil(requiredA / COPPER_CURRENT_DENSITY_A_PER_MM2), Math.ceil(minCsaMm2));
  return {
    widthMm: 0,
    thicknessMm: 0,
    csaMm2: csa,
    ampacityA: round(csa * COPPER_CURRENT_DENSITY_A_PER_MM2, 0),
    totalCurrentA: round(totalCurrentA, 1),
  };
}

/**
 * Size the neutral and protective-earth (PE) bars from the phase bar.
 *
 * - **Neutral**: full-size (= phase bar). LV distribution boards carry single-
 *   phase and triplen-harmonic load whose neutral current can equal or exceed the
 *   phase current, so a reduced neutral is unsafe by default (IEC 60364-5-52
 *   §524, PUIL 2011). Rated the same continuous current as the phase bar.
 * - **PE**: the IEC 60364-5-54 §543.1.2 / PUIL adiabatic rule applied to the
 *   phase section S — S for S ≤ 16, 16 for 16 < S ≤ 35, S/2 above — with a 6 mm²
 *   floor (separate, non-cable-sheath protective conductor).
 */
export function sizeNeutralPeBars(
  phaseCsaMm2: number,
  phaseAmpacityA: number,
): { neutralCsaMm2: number; neutralAmpacityA: number; peCsaMm2: number } {
  const pe = phaseCsaMm2 <= 16 ? phaseCsaMm2 : phaseCsaMm2 <= 35 ? 16 : phaseCsaMm2 / 2;
  return {
    neutralCsaMm2: round(phaseCsaMm2, 1),
    neutralAmpacityA: round(phaseAmpacityA, 0),
    peCsaMm2: round(Math.max(pe, 6), 1),
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
  /** Force a new busbar section to start at this way (user-driven manual break). */
  breakBefore?: boolean;
}

export interface SplitBusbarOptions {
  /** Maximum outgoing ways on one section before splitting. */
  maxWays: number;
  /** Maximum continuous current one section carries before splitting (A). */
  maxSectionCurrentA: number;
  /** Panel system — single-phase loads sum on one line; 3-phase use the worst phase. */
  system: SystemType;
  /** Cross-section floor so each section bar meets the short-circuit withstand. */
  minCsaMm2?: number;
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
 * Divide a panel's outgoing ways into busbar sections. Ways are taken in order; a
 * new section starts when the user forces a manual break at a way, or when adding
 * it would exceed the way-count cap or the continuous-current cap (the largest
 * practical single bar). Each section is sized for the worst-phase current of the
 * ways it carries. Always returns at least one section (a single empty section for
 * a panel with no ways), so renderers can iterate sections uniformly.
 *
 * Sections are **distribution busbars** in IEC 61439-1 terms: each is fed
 * radially from the incomer (its own dropper off the incoming terminals), NOT
 * chained in series through the previous bar — so no section carries another
 * section's through-current and per-group sizing is valid. The panel's main bus
 * (`PanelResult.busbar`) remains rated for the full incomer current.
 */
export function splitBusbarSections(
  ways: BusbarWayLoad[],
  opts: SplitBusbarOptions,
): BusbarSectionResult[] {
  const maxWays = Math.max(1, Math.floor(opts.maxWays));
  const sections: BusbarSectionResult[] = [];
  let group: BusbarWayLoad[] = [];
  // Whether the current group began at a user-forced break (for the badge/flag).
  let groupManual = false;

  const flush = () => {
    if (group.length === 0) return;
    const currentA = round(sectionWorstPhaseA(group, opts.system), 1);
    sections.push({
      index: sections.length + 1,
      circuitIds: group.map((w) => w.id),
      ways: group.length,
      sectionCurrentA: currentA,
      busbar: sizeBusbar(currentA, 0, opts.minCsaMm2 ?? 0),
      manualBreak: groupManual,
    });
    group = [];
    groupManual = false;
  };

  for (const w of ways) {
    const manual = w.breakBefore === true;
    if (group.length > 0) {
      const overWays = group.length + 1 > maxWays;
      const overCurrent = sectionWorstPhaseA([...group, w], opts.system) > opts.maxSectionCurrentA;
      if (manual || overWays || overCurrent) {
        flush();
        // The new section is "manual" only when the break was user-forced (a break
        // on the very first way is a no-op — there is nothing before it to split).
        if (manual) groupManual = true;
      }
    }
    group.push(w);
  }
  flush();

  if (sections.length === 0) {
    sections.push({
      index: 1,
      circuitIds: [],
      ways: 0,
      sectionCurrentA: 0,
      busbar: sizeBusbar(0),
      manualBreak: false,
    });
  }
  return sections;
}
