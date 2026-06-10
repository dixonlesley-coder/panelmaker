import {
  EARTHING_SYSTEMS,
  MAX_EARTH_RESISTANCE_OHM,
  mainBondingConductor,
  mainEarthingConductor,
  neutralConductorSize,
  peConductorSize,
} from '../standards/grounding';
import type { CableType, EarthingSystem, LoadKind, SystemType } from '../types/electrical';
import type { EarthingResult, GroundingResult, RcdSpec } from '../types/results';
import { designElectrode } from './electrode';

/** Default assumed soil resistivity (Ω·m) when the site value is unknown (loam). */
export const DEFAULT_SOIL_RESISTIVITY_OHM_M = 100;

export interface GroundingInput {
  phaseCsaMm2: number;
  panelSystem: SystemType;
  threePhase: boolean;
  /** Three-phase loads without a neutral (e.g. motors) use 4 cores not 5. */
  hasNeutral?: boolean;
  cableType?: CableType;
  reducedNeutral?: boolean;
  /** Equal parallel runs per phase; each run carries its own PE. */
  runsPerPhase?: number;
}

/**
 * Size the protective-earth (PE) and neutral conductors and describe the cable
 * make-up: single-phase = L+N+PE; three-phase = 3L+N+PE (or 3L+PE without a
 * neutral, e.g. for motors). With parallel runs the make-up is per run, prefixed
 * with the run count (each run carries its own PE/neutral core).
 */
export function sizeGrounding(i: GroundingInput): GroundingResult {
  const pe = peConductorSize(i.phaseCsaMm2);
  const hasNeutral = i.hasNeutral ?? true;
  const neutral = hasNeutral ? neutralConductorSize(i.phaseCsaMm2, i.reducedNeutral) : 0;

  const liveCores = i.threePhase ? 3 : 1;
  const cores = liveCores + (hasNeutral ? 1 : 0) + 1; // + PE
  const type = i.cableType ?? (i.threePhase ? 'NYY' : 'NYM');

  const runs = i.runsPerPhase ?? 1;
  const prefix = runs > 1 ? `${runs}× ` : '';
  const cableSpec = `${prefix}${type} ${cores}×${i.phaseCsaMm2} mm² (+ ${pe} mm² PE)`;

  return { peCsaMm2: pe, neutralCsaMm2: neutral, cores, cableSpec };
}

/**
 * Design the installation earthing system: RCD policy, main earthing + bonding
 * conductors and the electrode resistance target. The supply PE is the PE of the
 * main incomer.
 */
export function computeEarthing(
  system: EarthingSystem,
  supplyPeMm2: number,
  soilResistivityOhmM: number = DEFAULT_SOIL_RESISTIVITY_OHM_M,
): EarthingResult {
  const info = EARTHING_SYSTEMS.find((s) => s.value === system) ?? EARTHING_SYSTEMS[0]!;
  const requiresRcd = system === 'TT';
  const tail = requiresRcd
    ? ' Earth-fault loop impedance is high, so an RCD provides fault protection on every final circuit.'
    : ' Overcurrent devices clear earth faults; RCDs are still required for socket-outlets and special locations.';
  // Earth-electrode (driven-rod array) design to reach the target resistance.
  const electrode = designElectrode({
    soilResistivityOhmM,
    targetOhm: MAX_EARTH_RESISTANCE_OHM,
  });
  return {
    system,
    label: info.label,
    requiresRcd,
    mainEarthingConductorMm2: mainEarthingConductor(supplyPeMm2),
    mainBondingConductorMm2: mainBondingConductor(supplyPeMm2),
    electrodeResistanceTargetOhm: MAX_EARTH_RESISTANCE_OHM,
    electrode,
    note: info.note + tail,
  };
}

export interface CircuitRcdInput {
  earthingSystem: EarthingSystem;
  loadKind: LoadKind;
  isFinalCircuit: boolean;
  designCurrentA: number;
}

/** Decide whether a circuit needs an RCD and at what sensitivity. */
export function circuitRcd(i: CircuitRcdInput): RcdSpec {
  if (i.earthingSystem === 'TT' && i.isFinalCircuit) {
    return {
      required: true,
      ratingMa: i.designCurrentA <= 63 ? 30 : 100,
      reason: 'TT system — RCD required for earth-fault protection.',
    };
  }
  if (i.loadKind === 'socket' || i.loadKind === 'ev_charger') {
    return {
      required: true,
      ratingMa: 30,
      reason: 'Socket / EV circuit — 30 mA RCD (additional protection).',
    };
  }
  return { required: false, ratingMa: 0, reason: '' };
}
