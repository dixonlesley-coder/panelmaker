import { neutralConductorSize, peConductorSize } from '../standards/grounding';
import type { CableType, SystemType } from '../types/electrical';
import type { GroundingResult } from '../types/results';

export interface GroundingInput {
  phaseCsaMm2: number;
  panelSystem: SystemType;
  threePhase: boolean;
  /** Three-phase loads without a neutral (e.g. motors) use 4 cores not 5. */
  hasNeutral?: boolean;
  cableType?: CableType;
  reducedNeutral?: boolean;
}

/**
 * Size the protective-earth (PE) and neutral conductors and describe the cable
 * make-up: single-phase = L+N+PE; three-phase = 3L+N+PE (or 3L+PE without a
 * neutral, e.g. for motors).
 */
export function sizeGrounding(i: GroundingInput): GroundingResult {
  const pe = peConductorSize(i.phaseCsaMm2);
  const hasNeutral = i.hasNeutral ?? true;
  const neutral = hasNeutral ? neutralConductorSize(i.phaseCsaMm2, i.reducedNeutral) : 0;

  const liveCores = i.threePhase ? 3 : 1;
  const cores = liveCores + (hasNeutral ? 1 : 0) + 1; // + PE
  const type = i.cableType ?? (i.threePhase ? 'NYY' : 'NYM');

  const cableSpec = `${type} ${cores}×${i.phaseCsaMm2} mm² (+ ${pe} mm² PE)`;

  return { peCsaMm2: pe, neutralCsaMm2: neutral, cores, cableSpec };
}
