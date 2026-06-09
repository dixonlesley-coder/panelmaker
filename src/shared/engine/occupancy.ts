/**
 * Occupancy-driven demand/diversity resolution (pure).
 *
 * When a panel declares an `occupancy`, the standard preset library
 * (`standards/occupancy`) supplies a recommended panel diversity factor and
 * per-load-kind demand factors. The engine applies them only where the user has
 * left the corresponding factor at the neutral default of 1 (i.e. "unspecified"),
 * so any explicit user-entered value always wins.
 */

import { recommendedDemandFactor, recommendedDiversity } from '../standards/occupancy';
import type { LoadKind } from '../types/electrical';
import type { CircuitInput, PanelInput } from '../types/project';

/** A factor left at the neutral default (1) is treated as "not specified". */
const NEUTRAL_FACTOR = 1;

/**
 * The panel diversity factor to use: the occupancy preset's recommendation when
 * the panel diversity is still at the neutral default and an occupancy is set,
 * otherwise the explicit panel value.
 */
export function effectiveDiversityFactor(panel: PanelInput): number {
  if (panel.occupancy && panel.diversityFactor === NEUTRAL_FACTOR) {
    return recommendedDiversity(panel.occupancy);
  }
  return panel.diversityFactor;
}

/**
 * The demand factor to use for a circuit: the occupancy preset's per-load-kind
 * recommendation when the circuit demand factor is still at the neutral default
 * and the occupancy overrides that kind, otherwise the explicit circuit value.
 */
export function effectiveDemandFactor(
  demandFactor: number,
  loadKind: LoadKind,
  occupancy: PanelInput['occupancy'],
): number {
  if (occupancy && demandFactor === NEUTRAL_FACTOR) {
    const rec = recommendedDemandFactor(occupancy, loadKind);
    if (rec !== undefined) return rec;
  }
  return demandFactor;
}

/** Resolve a circuit's effective demand factor under a panel's occupancy. */
export function circuitDemandFactor(circuit: CircuitInput, panel: PanelInput): number {
  return effectiveDemandFactor(circuit.demandFactor ?? NEUTRAL_FACTOR, circuit.loadKind, panel.occupancy);
}
