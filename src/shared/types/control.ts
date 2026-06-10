/** Control-circuit domain types: starters, gear assemblies and interlocks. */

import type { PartCategory } from './parts';

export type StarterType =
  | 'DOL'
  | 'STAR_DELTA'
  | 'REVERSING'
  | 'SOFT_STARTER'
  | 'VFD'
  | 'ATS'
  | 'PUMP';

export type StartingDuty = 'normal' | 'heavy' | 'jogging';

export type PumpControlMode = 'fill' | 'drain' | 'duplex' | 'booster';

export type LevelSensing = 'float' | 'electrode' | 'pressure' | 'ultrasonic';

export type InterlockKind = 'mechanical' | 'electrical' | 'key_castell';

export type InterlockRelation = 'mutual_exclusion' | 'sequence' | 'permissive';

/** How a device slot in a starter template is sized. */
export type SizingRule =
  | 'ac3-full-flc' // contactor at 100% motor FLC
  | 'ac3-star-winding' // contactor at 58% FLC (star)
  | 'overload-flc' // overload set to FLC
  | 'overload-star-flc' // overload in delta leg, FLC x 0.58
  | 'vfd-output' // drive sized to FLC
  | 'control-transformer'
  | 'control-fuse'
  | 'pilot'; // pilot device, fixed

/** Declarative description of one piece of gear a starter template instantiates. */
export interface DeviceSlotSpec {
  role: string;
  category: PartCategory;
  sizing: SizingRule;
  /** Quantity of identical devices (e.g. 3 pole indicator lamps). */
  qty?: number;
}

/** Declarative interlock requirement between two device roles in a template. */
export interface InterlockSpec {
  kind: InterlockKind;
  roleA: string;
  roleB: string;
  relation: InterlockRelation;
  note?: string;
}

/** A data-driven starter template definition (lives in standards). */
export interface StarterTemplateDef {
  type: StarterType;
  label: string;
  deviceSlots: DeviceSlotSpec[];
  interlocks: InterlockSpec[];
  controlTransformerRequired: boolean;
  /** Motor power range (kW) the starter is typically suited to. */
  suitedKwRange?: [number, number];
}

/** A sized piece of gear instantiated from a device slot. */
export interface AssemblyDevice {
  id: string;
  role: string;
  category: PartCategory;
  /** Target electrical rating the device must meet (A), if applicable. */
  targetRatingA?: number;
  /** Chosen catalog part id, if a matching part was found. */
  chosenPartId?: string;
  /** Human-readable chosen rating / setting (e.g. "40 A AC-3", "set 37 A"). */
  rating?: string;
  /** Heat dissipation contribution (W). */
  heatLossW?: number;
  /** DIN modules / width contribution (mm). */
  widthMm?: number;
  qty: number;
}

export interface Interlock {
  id: string;
  kind: InterlockKind;
  deviceAId: string;
  deviceBId: string;
  relation: InterlockRelation;
  note?: string;
}

/** Motor starting characteristics for the chosen starting method. */
export interface StartingAnalysis {
  method: string;
  /** Starting current (A). */
  startCurrentA: number;
  /** Starting current as a multiple of FLC. */
  startCurrentMultiple: number;
  /** Starting torque (% of full-load torque). */
  startTorquePct: number;
  note: string;
}

/** The complete control gear bill produced for one motor/control circuit. */
export interface ControlAssembly {
  circuitId: string;
  starterType: StarterType;
  motor?: { kw: number; flcA: number; poles: number };
  devices: AssemblyDevice[];
  interlocks: Interlock[];
  /** Starting current/torque analysis for the chosen method. */
  starting?: StartingAnalysis;
  /** Pump/level configuration, when the circuit is a pump control. */
  pump?: {
    mode: PumpControlMode;
    sensing: LevelSensing;
    requiredSensors: string[];
  };
  /**
   * The IEC 60947-4-1 TYPE-2 verified combination covering this motor (DOL
   * basis): breaker + contactor + overload range from manufacturer-style
   * coordination tables. `contactorMatches` flags whether the engine's own
   * contactor pick is at/above the verified set's.
   */
  coordination?: {
    breakerA: number;
    contactorAc3A: number;
    olRangeA: readonly [number, number];
    contactorMatches: boolean;
    note: string;
  };
  warnings: string[];
}
