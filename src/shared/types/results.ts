/** Calculation result and validation/warning types returned by the engine. */

import type { BreakerCurve, BreakerClass } from '../standards/protection';
import type { Ventilation } from '../standards/enclosure';
import type { ControlAssembly } from './control';
import type { PhaseAssignment, EarthingSystem } from './electrical';
import type { SourcesResult } from './sources';

/** Residual-current device requirement for a circuit. */
export interface RcdSpec {
  required: boolean;
  ratingMa: number;
  reason: string;
}

/** Installation earthing-system design. */
export interface EarthingResult {
  system: EarthingSystem;
  label: string;
  requiresRcd: boolean;
  /** Earthing conductor to the electrode (mm^2). */
  mainEarthingConductorMm2: number;
  /** Main protective bonding conductor (mm^2). */
  mainBondingConductorMm2: number;
  /** Target earth-electrode resistance (ohm). */
  electrodeResistanceTargetOhm: number;
  note: string;
}

/** Protective-earth + neutral conductor sizing and cable make-up for a circuit. */
export interface GroundingResult {
  peCsaMm2: number;
  neutralCsaMm2: number;
  /** Total cores (live + neutral + PE). */
  cores: number;
  /** Human-readable cable make-up, e.g. "NYY 4×16 mm² (+ 16 mm² PE)". */
  cableSpec: string;
}

/** Per-phase loading (line currents, A) and the resulting imbalance. */
export interface PhaseBalanceResult {
  L1: number;
  L2: number;
  L3: number;
  imbalancePct: number;
}

/** Project supply arrangement: direct LV, or MV with a step-down transformer. */
export interface SupplyResult {
  type: 'LV' | 'MV';
  voltageV: number;
  demandKva: number;
  note: string;
  mvVoltageV?: number;
  transformerKva?: number;
  transformerImpedancePct?: number;
  transformerPrimaryA?: number;
  transformerSecondaryA?: number;
}

export interface BreakerResult {
  ratingA: number;
  deviceClass: BreakerClass;
  curve: BreakerCurve;
}

export interface CableResult {
  csaMm2: number;
  baseKhaA: number;
  deratedIzA: number;
  deratingFactor: number;
  appliedRule: string;
}

export interface VoltageDropResult {
  dropV: number;
  dropPercent: number;
  limitPercent: number;
  withinLimit: boolean;
}

export interface CircuitResult {
  circuitId: string;
  name: string;
  designCurrentA: number;
  /** 1-phase circuits report their assigned phase; 3-phase report '3ph'. */
  phase: PhaseAssignment;
  breaker: BreakerResult;
  cable: CableResult;
  voltageDrop: VoltageDropResult;
  grounding: GroundingResult;
  rcd: RcdSpec;
  control?: ControlAssembly;
}

export interface BusbarResult {
  widthMm: number;
  thicknessMm: number;
  csaMm2: number;
  ampacityA: number;
  totalCurrentA: number;
}

export interface EnclosureResult {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  sheetThicknessMm: number;
  totalHeatW: number;
  ventilation: Ventilation;
  modules: number;
  rows: number;
}

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface SuggestedFix {
  description: string;
  /** Replacement catalog part id, when the fix is a part swap. */
  replacementPartId?: string;
  /** Machine-readable action the UI can dispatch to apply the fix. */
  action?: { type: string; payload: Record<string, unknown> };
}

export interface Warning {
  code: string;
  severity: WarningSeverity;
  message: string;
  panelId?: string;
  circuitId?: string;
  fixes?: SuggestedFix[];
}

export interface BomLine {
  partId?: string;
  description: string;
  category: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
  matched: boolean;
}

export interface CostResult {
  lines: BomLine[];
  grandTotal: number;
  currency: string;
  unmatchedCount: number;
}

export interface PanelResult {
  panelId: string;
  name: string;
  circuits: CircuitResult[];
  busbar: BusbarResult;
  enclosure: EnclosureResult;
  totalConnectedLoadW: number;
  totalDemandCurrentA: number;
  phaseBalance: PhaseBalanceResult;
  warnings: Warning[];
  standardsVersion: string;
}

/** A 24-hour building demand profile and peak analysis. */
export interface LoadProfileResult {
  /** Demand (kW) for each hour 0-23. */
  hourlyKw: number[];
  peakKw: number;
  /** Hour of day (0-23) at which the peak occurs. */
  peakHour: number;
  /** Total daily energy (kWh). */
  dailyKwh: number;
  /** Average/peak load factor (0-1). */
  loadFactor: number;
  /** Per-panel hourly contribution (the "where" over time). */
  byPanel: { panelId: string; name: string; hourlyKw: number[] }[];
  /** Circuits driving the peak hour, largest first. */
  peakContributors: { circuitId: string; name: string; panelName: string; kw: number }[];
}

/** Power-factor analysis and capacitor-bank (PFC) recommendation. */
export interface CapacitorBankResult {
  totalKw: number;
  totalKvar: number;
  existingPf: number;
  targetPf: number;
  /** True when correction is recommended (PF below the penalty threshold). */
  needed: boolean;
  requiredKvar: number;
  bankKvar: number;
  steps: number;
  stepKvar: number;
  note: string;
}

export interface SystemResult {
  projectId: string;
  panels: Record<string, PanelResult>;
  /** Panel ids in upstream (root-first) order. */
  order: string[];
  supply: SupplyResult;
  /** Installation earthing-system design. */
  earthing: EarthingResult;
  /** Power-factor analysis + capacitor-bank recommendation. */
  powerFactor: CapacitorBankResult;
  /** Distributed energy sources sizing, when configured. */
  sources?: SourcesResult;
  totals: {
    connectedLoadW: number;
    panelCount: number;
  };
  warnings: Warning[];
}
