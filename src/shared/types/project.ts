/**
 * Engine input model — a decoupled, plain-data view of a project/panel/circuit
 * that the pure calculation engine consumes. The DB layer maps its rows onto
 * these shapes; the engine never imports DB or DOM code.
 */

import type { SystemType, LoadKind, InstallMethod, EarthingSystem } from './electrical';
import type { StarterType, StartingDuty, PumpControlMode, LevelSensing } from './control';
import type { SourcesConfig } from './sources';

/** A load's daily operating window (hours). May wrap past midnight (e.g. 22→6). */
export interface LoadSchedule {
  /** Operating window start hour [0-23]. */
  startHour: number;
  /** Operating window end hour (exclusive) [1-24]. */
  endHour: number;
}

export interface CircuitInput {
  id: string;
  name: string;
  role: 'incomer' | 'branch';
  /** Connected load (W). For a feeder circuit this is derived from the sub-panel. */
  loadW: number;
  cosPhi: number;
  lengthM: number;
  loadKind: LoadKind;
  isLighting: boolean;
  /** Per-circuit demand/utilisation factor (0-1). */
  demandFactor: number;

  // Motor / control
  starterType?: StarterType;
  motorKw?: number;
  motorPoles?: number;
  startingDuty?: StartingDuty;

  // Pump / level
  controlMode?: PumpControlMode;
  sensing?: LevelSensing;

  /** Manual minimum cable section (mm^2), e.g. from applying a suggested fix. */
  cableOverrideMm2?: number;

  /** Daily operating window; absent = continuous (24 h). Drives the load profile. */
  schedule?: LoadSchedule;

  /** If set, this branch feeds another panel (its load = that panel's demand). */
  feedsPanelId?: string;
}

export interface PanelInput {
  id: string;
  name: string;
  system: SystemType;
  voltageV: number;
  ambientTempC: number;
  installMethod: InstallMethod;
  groupingCount: number;
  /** Diversity factor applied to the aggregated load when feeding upstream. */
  diversityFactor: number;
  /** Fed by the utility, or by a parent panel's feeder circuit. */
  sourceType: 'utility' | 'feeder';
  fedByCircuitId?: string;
  circuits: CircuitInput[];
}

export interface ProjectInput {
  id: string;
  name: string;
  panels: PanelInput[];
  /** Installation earthing system (default TN-C-S). */
  earthingSystem?: EarthingSystem;
  /** Optional distributed energy sources (generator / solar / battery). */
  sources?: SourcesConfig;
}
