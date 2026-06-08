import { COPPER_BUSBAR_TABLE, COPPER_CURRENT_DENSITY_A_PER_MM2 } from '../standards/protection';
import type { BusbarResult } from '../types/results';
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
