/** Control-circuit domain types: starters, gear assemblies and interlocks. */

import type { PartCategory } from './parts';
import type { ControlSchematic } from './schematic';

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

/**
 * How a set of pumps in a group share the duty. Each scheme implies the shared
 * control gear (level/timer controller, alternator relay) and the cross-pump
 * interlocks the engine auto-provisions.
 */
export type PumpGroupMode =
  | 'single-alternate' // duty / standby — one pump runs, role alternates each cycle
  | 'parallel-alternate' // duty / assist — lead runs, more stage in on demand, lead alternates
  | 'lead-lag' // fixed lead then lag, assist on demand, no alternation
  | 'parallel' // all pumps run together (no staging)
  | 'cascade'; // sequential staging by demand (booster set)

/** What initiates and modulates a pump group's run demand. */
export type PumpGroupTrigger = 'level' | 'timer' | 'pressure' | 'manual';

/**
 * A functional grouping of pump circuits operated together under one control
 * scheme (lead/lag alternation, parallel assist, cascade…), driven by a shared
 * water-level controller, timer or pressure transmitter. Lives on the panel
 * input; the engine derives the shared gear, the interlocks and the schematic.
 */
export interface PumpGroupConfig {
  id: string;
  name: string;
  mode: PumpGroupMode;
  trigger: PumpGroupTrigger;
  /** Member pump circuit ids, in lead order (index 0 = the first lead). */
  memberCircuitIds: string[];
  /** Level-sensing technology when the trigger is a water-level controller. */
  sensing?: LevelSensing;
  /** Timer ON duration (minutes) when the trigger is a cyclic timer. */
  timerOnMin?: number;
  /** Timer OFF duration (minutes) when the trigger is a cyclic timer. */
  timerOffMin?: number;
}

/**
 * The derived control package for one pump group: the shared sensing/controller
 * and alternator gear, the cross-pump interlocks, and the auto-generated group
 * control schematic. Produced by the engine alongside per-circuit assemblies.
 */
export interface PumpGroupResult {
  id: string;
  name: string;
  mode: PumpGroupMode;
  trigger: PumpGroupTrigger;
  /** Member pump circuit ids actually grouped (existing pump/motor circuits). */
  memberCircuitIds: string[];
  /** Member circuit display names, aligned to memberCircuitIds. */
  memberNames: string[];
  /** Shared control gear (level/timer/pressure controller, alternator relay…). */
  devices: AssemblyDevice[];
  /** Cross-circuit interlocks between the member pumps' contactors. */
  interlocks: Interlock[];
  /** Auto-generated group control (ladder) schematic. */
  schematic: ControlSchematic;
  warnings: string[];
  note: string;
}
