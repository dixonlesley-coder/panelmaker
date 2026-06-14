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
  /**
   * Topology of the DC-coupled sources. A hybrid (multi-mode) inverter combines
   * the solar array (MPPT input), the battery (DC port) and the grid (AC port)
   * into ONE unit feeding the bus, instead of a separate string inverter per
   * source. Undefined = auto: a single hybrid inverter whenever both solar and
   * battery are present (the usual PV + storage + PLN arrangement); set `false`
   * to force separate per-source inverters.
   */
  hybridInverter?: boolean;
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
  /**
   * True when the DC sources (solar + battery) and the grid are combined into a
   * single hybrid inverter rather than separate per-source inverters. Resolved
   * from {@link SourcesConfig.hybridInverter} (auto = on when both PV and battery
   * are present).
   */
  hybridInverter?: boolean;
  /** Continuous AC rating of the combined hybrid inverter (kW), when hybrid. */
  hybridInverterKw?: number;
}
