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
  note: string;
}

export interface SourcesResult {
  generator?: GeneratorResult;
  /** Motor-starting voltage-dip assessment for the genset, when motors exist. */
  gensetStart?: GensetStartResult;
  solar?: SolarResult;
  battery?: BatteryResult;
}
