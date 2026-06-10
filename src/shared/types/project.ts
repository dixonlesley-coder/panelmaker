/**
 * Engine input model — a decoupled, plain-data view of a project/panel/circuit
 * that the pure calculation engine consumes. The DB layer maps its rows onto
 * these shapes; the engine never imports DB or DOM code.
 */

import type { SystemType, LoadKind, InstallMethod, EarthingSystem, OccupancyType } from './electrical';
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
  /**
   * Building occupancy class. When set, the engine applies the occupancy's
   * recommended diversity / per-load demand factors wherever the panel/circuit
   * has been left at the neutral default (1). Explicit values always win.
   */
  occupancy?: OccupancyType;
  /** Fed by the utility, or by a parent panel's feeder circuit. */
  sourceType: 'utility' | 'feeder';
  fedByCircuitId?: string;
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
