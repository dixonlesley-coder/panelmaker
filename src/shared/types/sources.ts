/** Distributed energy source configuration (engine input) and results. */

import type { BatteryChemistry } from '../standards/sources';
// Type-only (erased at runtime — no cycle): genset motor-start assessment.
import type { GensetStartResult } from '../engine/gensetTransient';

export type GeneratorMode = 'standby' | 'prime';

export interface GeneratorConfig {
  enabled: boolean;
  /** Fraction of the building demand the genset must back up (0-1). */
  backupFraction: number;
  /** standby = intermittent (mains failure); prime = continuous duty (needs headroom). */
  mode: GeneratorMode;
  /**
   * Transfer arrangement: automatic transfer switch (default) or a manual
   * changeover (COS) — common on small installs; an operator must switch, so
   * expect an outage until they do.
   */
  transfer?: 'ats' | 'manual';
}

export interface SolarConfig {
  enabled: boolean;
  /** Target array size (kWp). */
  targetKwp: number;
  /** Panel nameplate power (Wp). */
  panelWp: number;
  /** DC/AC oversizing ratio. */
  dcAcRatio: number;
}

export interface BatteryConfig {
  enabled: boolean;
  /** Critical load to support (kW). */
  backupKw: number;
  /** Required autonomy (hours). */
  autonomyHours: number;
  chemistry: BatteryChemistry;
}

export interface SourcesConfig {
  generator?: GeneratorConfig;
  solar?: SolarConfig;
  battery?: BatteryConfig;
}

export interface GeneratorResult {
  ratingKva: number;
  backupKva: number;
  mode: GeneratorMode;
  /**
   * Number of essential panels the backup demand was derived from. Absent (or
   * 0) when no panel is marked essential and the blanket `backupFraction` of
   * the whole-building demand was used instead.
   */
  essentialPanelCount?: number;
  /** Transfer arrangement the design assumes (ATS vs manual changeover). */
  transfer: 'ats' | 'manual';
  note: string;
}

export interface SolarResult {
  panelWp: number;
  panelCount: number;
  arrayKwp: number;
  inverterKw: number;
  /** Panels in series per string. */
  stringSize: number;
  /** Number of parallel strings. */
  strings: number;
  /** Estimated daily energy yield (kWh). */
  dailyKwh: number;
  note: string;
}

export interface BatteryResult {
  chemistry: BatteryChemistry;
  requiredKwh: number;
  usableKwh: number;
  installedKwh: number;
  moduleKwh: number;
  moduleCount: number;
  inverterKw: number;
  /** The backup power the bank was sized for (kW) — critical demand or manual. */
  backupKw: number;
  /**
   * Number of UPS-backed (critical) panels the backup power was derived from.
   * Absent (or 0) when none is marked and the manual `backupKw` was used.
   */
  criticalPanelCount?: number;
  note: string;
}

export interface SourcesResult {
  generator?: GeneratorResult;
  /** Motor-starting voltage-dip assessment for the genset, when motors exist. */
  gensetStart?: GensetStartResult;
  solar?: SolarResult;
  battery?: BatteryResult;
}
