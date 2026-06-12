/**
 * Engine input model — a decoupled, plain-data view of a project/panel/circuit
 * that the pure calculation engine consumes. The DB layer maps its rows onto
 * these shapes; the engine never imports DB or DOM code.
 */

import type {
  SystemType,
  LoadKind,
  InstallMethod,
  Insulation,
  ConductorMaterial,
  EarthingSystem,
  OccupancyType,
  CableType,
} from './electrical';
import type { StarterType, StartingDuty, PumpControlMode, LevelSensing } from './control';
import type { LightFixture, SocketOutlet, SwitchGroup } from './fixtures';
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
  /**
   * Explicit supply phase count (1 or 3). Overrides the automatic inference
   * (which keys off the motor rating / load size), so a single-phase booster
   * pump or a three-phase resistive bank can be stated outright. Ignored on a
   * single-phase panel (everything is 1-phase there).
   */
  phases?: 1 | 3;

  // Pump / level
  controlMode?: PumpControlMode;
  sensing?: LevelSensing;

  // Point-level detail (final circuits). When fixtures/sockets are present the
  // engine derives the connected load from the points, superseding `loadW`.
  /** Light-fixture rows on a lighting circuit. */
  fixtures?: LightFixture[];
  /** Switching points (conventional gangs / smart relay channels) for the fixtures. */
  switchGroups?: SwitchGroup[];
  /** Socket-outlet rows on a socket circuit. */
  sockets?: SocketOutlet[];

  /**
   * Life-safety circuit (fire pump, smoke-control fan, emergency lighting,
   * fire-service lift). Availability prevails over protection: no RCD (an
   * earth-fault trip must not stop a fire pump), fire-resistant cable (FRC)
   * by default, and warnings when it isn't backed by the essential bus.
   */
  lifeSafety?: boolean;

  /** Manual minimum cable section (mm^2), e.g. from applying a suggested fix. */
  cableOverrideMm2?: number;
  /**
   * Explicit cable construction for this run (NYY / NYM / NYA / NYAF …). When
   * absent the engine derives the type from the panel (NYY 3ph / NYM 1ph; N2XY
   * for XLPE; NAYY/NA2XY for aluminum). Drives the cable label on schedules and
   * which catalog cable family the BOM matches; sizing itself is unaffected.
   */
  cableType?: CableType;
  /**
   * Manual breaker rating override (A). When set, the engine uses this rating
   * instead of auto-sizing from the load — and FLAGS non-compliance (an
   * undersized override nuisance-trips) rather than silently correcting it.
   * The cable still auto-sizes to cover the override (Iz ≥ In coordination).
   */
  breakerOverrideA?: number;

  /**
   * Force a busbar section break at this circuit: it starts a new busbar line in
   * the panel regardless of the automatic way/current caps. Lets the user split
   * the bus by hand (e.g. group a feeder bank onto its own section).
   */
  busbarBreakBefore?: boolean;

  /**
   * Pin a single-phase circuit to a specific line. Auto-balancing re-shuffles
   * phases as loads change; an as-built schedule needs stable, locked phases.
   * Ignored for three-phase circuits.
   */
  phaseOverride?: 'L1' | 'L2' | 'L3';

  /**
   * Per-circuit grouping count override (cables bunched on THIS route),
   * replacing the panel-wide `groupingCount` in the derating product — grouping
   * is a property of the containment route, not of the board.
   */
  groupingCountOverride?: number;

  /** Daily operating window; absent = continuous (24 h). Drives the load profile. */
  schedule?: LoadSchedule;

  /** If set, this branch feeds another panel (its load = that panel's demand). */
  feedsPanelId?: string;
}

export interface PanelInput {
  id: string;
  /** Descriptive name, e.g. "Ground-floor lighting & power". */
  name: string;
  /**
   * Short panel designation / tag, e.g. "LP-1", "MDP", "MCC-2". Optional; when
   * set it labels the panel alongside the descriptive name in schedules, the
   * SLD, the drawings and the PDF.
   */
  tag?: string;
  system: SystemType;
  voltageV: number;
  ambientTempC: number;
  installMethod: InstallMethod;
  /**
   * Cable insulation family for this panel's circuits: PVC (NYM/NYY, 70 °C) or
   * XLPE (N2XY, 90 °C). Default PVC. Drives ampacity, ambient derating and the
   * PE adiabatic constant.
   */
  insulation?: Insulation;
  /**
   * Conductor material for this panel's circuits (default Cu). Aluminum is
   * floored at 16 mm² and carries its own ampacity ratio, resistance and
   * adiabatic k; cables label NAYY / NA2XY.
   */
  material?: ConductorMaterial;
  groupingCount: number;
  /** Diversity factor applied to the aggregated load when feeding upstream. */
  diversityFactor: number;
  /**
   * Building occupancy class. When set, the engine applies the occupancy's
   * recommended diversity / per-load demand factors wherever the panel/circuit
   * has been left at the neutral default (1). Explicit values always win.
   */
  occupancy?: OccupancyType;
  /** Fed by the utility, or by a parent panel's feeder circuit. */
  sourceType: 'utility' | 'feeder';
  fedByCircuitId?: string;
  /**
   * Essential (genset-backed) panel: stays alive on mains failure. When any
   * panel is marked, the generator backup demand derives from the essential
   * panels' actual demand instead of the blanket `backupFraction`, and the
   * power one-line splits an essential bus behind the ATS.
   */
  essential?: boolean;
  /**
   * UPS-backed (critical) panel: rides the battery/central-UPS through any
   * outage (servers, fire alarm, BMS). When any panel is marked, the battery
   * backup power derives from the critical panels' actual demand instead of
   * the manual `backupKw`, and the one-line draws a UPS/critical bus.
   */
  upsBacked?: boolean;
  /**
   * Tenant/check kWh sub-meter at this board (multi-tenant buildings meter
   * every tenant DB). The engine picks direct vs CT metering from the panel
   * demand; the meter (+ CTs) lands in the BOM.
   */
  submeter?: boolean;
  circuits: CircuitInput[];
}

/**
 * Commercial quotation settings — the labor rate and the cost mark-ups applied
 * on top of the priced material BOM to build a sell price / proposal. Every
 * field is optional; the quotation engine substitutes sane defaults when a value
 * is absent, so existing projects (with no `quotation`) still quote sensibly.
 */
export interface QuotationSettings {
  /** Shop assembly/wiring labor rate (currency per hour). */
  laborRatePerHour?: number;
  /** Overhead loading as a percentage of (material + labor). */
  overheadPct?: number;
  /** Profit margin as a percentage of the loaded cost base. */
  marginPct?: number;
  /** Contingency / risk allowance as a percentage of (material + labor). */
  contingencyPct?: number;
  /** Quote currency (defaults to IDR). */
  currency?: string;
}

/** One entry in a drawing's revision history (title-block revision block). */
export interface ProjectRevision {
  /** Revision label, e.g. "A", "B", "01". */
  rev: string;
  /** Issue date (free-text or ISO; rendered verbatim). */
  date: string;
  /** Description of what changed at this revision. */
  note: string;
  /** Who issued the revision (initials/name). */
  by?: string;
}

/**
 * Optional project-level branding / title-block metadata. Drives the PDF title
 * block, the revision block, and the small drawing title-strip. Every field is
 * optional so existing projects (which have no `meta`) keep working unchanged.
 */
export interface ProjectMeta {
  /** End client / owner the design is prepared for. */
  client?: string;
  /** Site / installation location. */
  location?: string;
  /** Responsible engineer (name / initials). */
  engineer?: string;
  /** Designing company / consultancy name. */
  companyName?: string;
  /** Drawing number stamped in the title block. */
  drawingNumber?: string;
  /** Project / job number. */
  projectNumber?: string;
  /** Current revision label, e.g. "A". */
  revision?: string;
  /** Company logo as a base64 data URL (offline-friendly, embedded in PDFs). */
  logoDataUrl?: string;
  /** Revision history rendered as the title-block revision table. */
  revisions?: ProjectRevision[];
  /** Commercial quotation settings (labor rate + mark-ups). */
  quotation?: QuotationSettings;
  /**
   * Power-factor correction target (0-1). Default 0.95 — comfortably above the
   * 0.85 PLN penalty threshold. The capacitor bank is sized to reach this.
   */
  targetPf?: number;
  /**
   * Dual-transformer supply (hotels, data centers): forces an MV service with
   * TWO transformers — each sized for half the demand — on split bus sections
   * behind a normally-open bus coupler. Fault level is one unit's (N.O. coupler).
   */
  dualTransformer?: boolean;
}

/**
 * Optional site/installation conditions that drive surge-protection (SPD) and
 * earth-electrode design. All optional with safe defaults (no LPS, underground
 * supply, ~100 Ω·m soil), so existing projects compute unchanged.
 */
export interface SiteConditions {
  /** Building has an external Lightning Protection System (forces a Type 1 SPD). */
  externalLps?: boolean;
  /** Supply arrives via an overhead line / direct-strike exposure (Type 1 SPD). */
  overheadSupply?: boolean;
  /** Measured/assumed soil resistivity (Ω·m) for earth-electrode sizing. */
  soilResistivityOhmM?: number;
  /**
   * Soil THERMAL resistivity (K·m/W) for buried-cable derating (IEC reference
   * 2.5). Distinct from the electrical resistivity above.
   */
  soilThermalResistivityKmW?: number;
}

export interface ProjectInput {
  id: string;
  name: string;
  panels: PanelInput[];
  /** Installation earthing system (default TN-C-S). */
  earthingSystem?: EarthingSystem;
  /** Optional distributed energy sources (generator / solar / battery). */
  sources?: SourcesConfig;
  /** Optional project branding / title-block metadata. */
  meta?: ProjectMeta;
  /** Optional site conditions (lightning exposure, soil resistivity) for SPD/earthing. */
  site?: SiteConditions;
}
