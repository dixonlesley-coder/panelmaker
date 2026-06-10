/** Calculation result and validation/warning types returned by the engine. */

import type { BreakerCurve, BreakerClass } from '../standards/protection';
import type { Ventilation } from '../standards/enclosure';
import type { ControlAssembly } from './control';
import type { PhaseAssignment, EarthingSystem } from './electrical';
import type { SourcesResult } from './sources';
// Type-only imports of result shapes defined alongside their engine modules
// (erased at runtime — no import cycle): SPD, earth-electrode and busbar withstand.
import type { SpdResult } from '../engine/spd';
import type { ElectrodeResult } from '../engine/electrode';
import type { BusbarWithstandResult } from '../engine/busbarFault';
import type { EnclosureThermalResult } from '../engine/enclosureThermal';

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
  /** Earth-electrode (rod array) design from soil resistivity. */
  electrode?: ElectrodeResult;
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
  /**
   * True when the section was increased beyond the ampacity minimum to keep the
   * run's voltage drop within its 3%/5% limit (informational — the cable is
   * compliant by construction, the surcharge in copper is just made visible).
   */
  vdDriven?: boolean;
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
  /**
   * Cumulative voltage drop from the supply origin to this circuit's load (%),
   * i.e. the sum of every upstream feeder segment's drop plus this run's drop.
   * Set by `computeSystem` once the feeder tree is known. PUIL/IEC measure the
   * 3%/5% limit from the origin, so a deep branch can breach it even when its own
   * segment is within limit.
   */
  cumulativeDropPercent?: number;
  grounding: GroundingResult;
  rcd: RcdSpec;
  control?: ControlAssembly;
  /** Specified device breaking capacity (kA, Icu). */
  breakerKa?: number;
  /** True when the breaker's kA covers the prospective fault at its bus. */
  kaAdequate?: boolean;
  /** Earth-fault loop impedance over the run (ohm), TN systems. */
  zsOhm?: number;
  /** Maximum permissible Zs for disconnection in the required time (ohm). */
  zsMaxOhm?: number;
  /** True when Zs <= Zs_max (automatic disconnection within the limit). */
  disconnectsInTime?: boolean;
  /** Prospective earth-fault current at the circuit (A), U0/Zs — TN systems. */
  earthFaultA?: number;
  /** Minimum PE CSA for adiabatic thermal withstand of the earth fault (mm²). */
  peMinAdiabaticMm2?: number;
  /** True when the PE conductor meets the adiabatic thermal-withstand minimum. */
  peAdiabaticOk?: boolean;
  /** Conduit-fill sizing for this circuit's cable. See `engine/containment`. */
  containment?: ContainmentResult;
}

/** Conduit sizing + fill for a single circuit cable. */
export interface ContainmentResult {
  /** Estimated cable outer diameter (mm). */
  cableOdMm: number;
  /** Smallest standard conduit nominal size that satisfies the fill rule (mm). */
  conduitSizeMm: number;
  /** Conduit fill (%) — cable area over the conduit's usable bore area. */
  fillPct: number;
}

/** Cable-tray sizing for all of a panel's outgoing cables (single-layer). */
export interface CableTrayResult {
  /** Smallest standard tray width that holds the cables side-by-side (mm). */
  widthMm: number;
  /** Tray width utilisation (%). */
  fillPct: number;
  /** Number of cables carried. */
  cableCount: number;
}

export interface BusbarResult {
  widthMm: number;
  thicknessMm: number;
  csaMm2: number;
  ampacityA: number;
  totalCurrentA: number;
  /** Short-circuit (Icw / Ipk) withstand check at the panel's prospective fault. */
  withstand?: BusbarWithstandResult;
}

/** Future-expansion headroom on a panel's busbar and ways. */
export interface SpareCapacityResult {
  /** Busbar continuous-current headroom over the present demand (%). */
  busbarHeadroomPct: number;
  /** True when the busbar reserve meets the recommended ≥ 25% future allowance. */
  meetsReserveTarget: boolean;
  /** Recommended spare DIN ways to leave for future circuits (≈ 20%, min 3). */
  recommendedSpareWays: number;
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
  /** Temperature-rise verification + IP-rating recommendation (IEC 61439-1 / 60890). */
  thermal?: EnclosureThermalResult;
}

/**
 * Harmonics / power-quality estimate for a panel carrying non-linear
 * (electronically switched) loads — VFDs, soft-starters, UPS and 6-pulse
 * rectifier loads. See `engine/harmonics`.
 */
export interface HarmonicsResult {
  /** Non-linear demand over total panel demand (0-1). */
  nonLinearFraction: number;
  /** Recommended neutral-current multiplier of phase current (1.0 = standard). */
  neutralOversizeFactor: number;
  /**
   * Recommended neutral CSA (mm^2) for the panel's largest neutral, oversized
   * for triplen-harmonic content. Equals the phase CSA when no oversize needed.
   */
  recommendedNeutralCsaMm2: number;
  /** True when a 6-pulse input line reactor is recommended. */
  reactorRecommended: boolean;
  /** Recommended input line-reactor impedance (% Z) when reactorRecommended. */
  reactorPctZ: number;
  /** True when a harmonic filter (passive/active) is recommended. */
  filterRecommended: boolean;
  /** Qualitative voltage/current THD band. */
  thdBand: 'low' | 'moderate' | 'high';
  note: string;
}

/**
 * Simplified arc-flash / incident-energy estimate for a panel bus — a Ralph Lee
 * approximation mapped to an NFPA 70E PPE category. A design risk-screen, NOT a
 * full IEEE 1584 study. See `engine/arcFlash`.
 */
export interface ArcFlashResult {
  /** Estimated incident energy at the working distance (cal/cm²). */
  incidentEnergyCalCm2: number;
  /** Working distance the estimate is referenced to (mm). */
  workingDistanceMm: number;
  /** Assumed arcing (clearing) time (s). */
  arcingTimeS: number;
  /** NFPA 70E PPE category label. */
  ppeCategory: string;
  /** Arc-flash boundary distance where incident energy falls to 1.2 cal/cm² (mm). */
  arcFlashBoundaryMm: number;
  note: string;
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
  /** Manufacturer order code / SKU of the matched part, when it carries one. */
  sku?: string;
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

/** One labelled line of a quotation breakdown (Material, Labor, …). */
export interface QuotationSection {
  /** Section label, e.g. "Material", "Labor", "Margin". */
  label: string;
  /** Section amount in the quote currency. */
  amount: number;
}

/**
 * Commercial quotation / proposal total for a project: the priced material BOM
 * plus assembly labor, with overhead, contingency and margin mark-ups rolled up
 * into a sell price. Produced by `computeQuotation` (pure engine).
 */
export interface QuotationResult {
  /** Priced material BOM (the consolidated, costed lines that were quoted). */
  lines: BomLine[];
  /** Sum of the matched material line totals. */
  materialSubtotal: number;
  /** Total assembly man-hours derived from the BOM via the labor standard. */
  laborHours: number;
  /** Labor cost = laborHours × the labor rate. */
  laborSubtotal: number;
  /** Overhead loading on (material + labor). */
  overhead: number;
  /** Contingency / risk allowance on (material + labor). */
  contingency: number;
  /** The cost base the margin is applied to (material + labor + overhead + contingency). */
  marginBase: number;
  /** Profit margin on the cost base. */
  margin: number;
  /** Final sell price = marginBase + margin. */
  grandTotal: number;
  currency: string;
  /** The settings actually used (after defaults were applied), for display. */
  settings: {
    laborRatePerHour: number;
    overheadPct: number;
    marginPct: number;
    contingencyPct: number;
  };
  /** Ordered breakdown sections for tabular display. */
  sections: QuotationSection[];
  /** Standards version the labor figures were taken from. */
  standardsVersion: string;
}

export interface PanelResult {
  panelId: string;
  name: string;
  circuits: CircuitResult[];
  busbar: BusbarResult;
  enclosure: EnclosureResult;
  totalConnectedLoadW: number;
  totalDemandCurrentA: number;
  /** Future-expansion headroom on the busbar + recommended spare ways. */
  spare?: SpareCapacityResult;
  phaseBalance: PhaseBalanceResult;
  warnings: Warning[];
  standardsVersion: string;
  /** Prospective 3-phase symmetrical fault current at this panel's bus (kA). */
  faultLevelKa?: number;
  /** Harmonics / power-quality estimate, when non-linear loads are present. */
  harmonics?: HarmonicsResult;
  /** Simplified arc-flash incident-energy estimate at the bus, when fault known. */
  arcFlash?: ArcFlashResult;
  /** Cable-tray sizing for the panel's outgoing cables. */
  cableTray?: CableTrayResult;
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

/**
 * Current-based discrimination report for one upstream→downstream device pair
 * (feeder breaker vs the sub-panel's largest branch breaker). `selective` is a
 * first-pass screen on the rating ratio; full coordination needs manufacturer
 * time-current / let-through curves.
 */
export interface SelectivityEntry {
  upstreamPanelId: string;
  upstreamCircuitId: string;
  upstreamName: string;
  upstreamRatingA: number;
  downstreamPanelId: string;
  downstreamName: string;
  downstreamRatingA: number;
  /** Upstream rating / downstream rating. */
  ratio: number;
  /** True when ratio meets the overload discrimination rule of thumb. */
  selective: boolean;
  /**
   * Current up to which short-circuit discrimination holds (A): the upstream
   * device's lower magnetic-trip threshold, below which only the downstream
   * device trips instantaneously. Above it, both may trip (loss of selectivity).
   */
  selectivityLimitA?: number;
  /** Prospective fault at the downstream bus (A), compared against the limit. */
  downstreamFaultA?: number;
  /** True when the downstream fault stays within the short-circuit limit. */
  scSelective?: boolean;
  marginNote: string;
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
  /** Surge-protection (SPD) recommendation at the service origin. */
  spd?: SpdResult;
  /** Distributed energy sources sizing, when configured. */
  sources?: SourcesResult;
  /** Current-based discrimination report per cascaded device pair. */
  selectivity?: SelectivityEntry[];
  totals: {
    connectedLoadW: number;
    panelCount: number;
  };
  warnings: Warning[];
}
