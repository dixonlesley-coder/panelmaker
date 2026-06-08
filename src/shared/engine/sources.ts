import {
  selectGeneratorKva,
  PV_PANEL_DEFAULT,
  MPPT_VMAX,
  MPPT_VMIN,
  MAX_SYSTEM_VOLTAGE,
  VOC_COLD_FACTOR,
  PEAK_SUN_HOURS,
  PV_PERFORMANCE_RATIO,
  selectInverterKw,
  BATTERY_MODULE_LFP,
  DEPTH_OF_DISCHARGE,
  BATTERY_EFFICIENCY,
  type BatteryModule,
} from '../standards/sources';
import type {
  BatteryConfig,
  BatteryResult,
  GeneratorConfig,
  GeneratorResult,
  SolarConfig,
  SolarResult,
  SourcesConfig,
  SourcesResult,
} from '../types/sources';
import { round } from './util';

/** Size a standby/prime generator to back up a fraction of the building demand. */
export function sizeGenerator(buildingDemandKva: number, cfg: GeneratorConfig): GeneratorResult {
  const backupKva = buildingDemandKva * cfg.backupFraction;
  // Prime (continuous) duty needs ~25% headroom; standby covers the backup load directly.
  const required = cfg.mode === 'prime' ? backupKva * 1.25 : backupKva;
  const ratingKva = selectGeneratorKva(required);
  return {
    ratingKva,
    backupKva: round(backupKva, 1),
    mode: cfg.mode,
    note: `${cfg.mode === 'prime' ? 'Prime (continuous)' : 'Standby'} genset backing up ${Math.round(
      cfg.backupFraction * 100,
    )}% of demand (${round(backupKva, 1)} kVA) → ${ratingKva} kVA. Transfers on mains failure via ATS.`,
  };
}

/** Size a grid-tied/hybrid solar PV array, its inverter and string configuration. */
export function sizeSolar(cfg: SolarConfig, sunHours = PEAK_SUN_HOURS): SolarResult {
  const { vmp, voc } = PV_PANEL_DEFAULT;

  const panelCount = Math.max(1, Math.ceil((cfg.targetKwp * 1000) / cfg.panelWp));
  const arrayKwp = round((panelCount * cfg.panelWp) / 1000, 2);
  const inverterKw = selectInverterKw(arrayKwp / cfg.dcAcRatio);

  // String length is bounded by the MPPT window and the cold-Voc max-system-voltage limit.
  const maxByMppt = Math.floor(MPPT_VMAX / vmp);
  const maxByVoltage = Math.floor(MAX_SYSTEM_VOLTAGE / (voc * VOC_COLD_FACTOR));
  const minByMppt = Math.max(1, Math.ceil(MPPT_VMIN / vmp));
  const stringSize = Math.max(minByMppt, Math.min(maxByMppt, maxByVoltage, panelCount));
  const strings = Math.ceil(panelCount / stringSize);

  const dailyKwh = round(arrayKwp * sunHours * PV_PERFORMANCE_RATIO, 1);

  return {
    panelWp: cfg.panelWp,
    panelCount,
    arrayKwp,
    inverterKw,
    stringSize,
    strings,
    dailyKwh,
    note: `${panelCount} x ${cfg.panelWp} Wp (${arrayKwp} kWp) as ${strings} string(s) of ${stringSize}; ${inverterKw} kW inverter (DC/AC ${cfg.dcAcRatio}); ~${dailyKwh} kWh/day at ${sunHours} peak-sun-hours.`,
  };
}

/** Size a backup battery bank and its inverter/charger for a load + autonomy. */
export function sizeBattery(cfg: BatteryConfig, module: BatteryModule = BATTERY_MODULE_LFP): BatteryResult {
  const dod = DEPTH_OF_DISCHARGE[cfg.chemistry];
  const requiredKwh = (cfg.backupKw * cfg.autonomyHours) / (dod * BATTERY_EFFICIENCY);
  const moduleCount = Math.max(1, Math.ceil(requiredKwh / module.kwh));
  const installedKwh = round(moduleCount * module.kwh, 2);
  const usableKwh = round(installedKwh * dod, 2);
  const inverterKw = selectInverterKw(cfg.backupKw);

  return {
    chemistry: cfg.chemistry,
    requiredKwh: round(requiredKwh, 1),
    usableKwh,
    installedKwh,
    moduleKwh: module.kwh,
    moduleCount,
    inverterKw,
    note: `${cfg.backupKw} kW for ${cfg.autonomyHours} h (${cfg.chemistry}, DoD ${Math.round(
      dod * 100,
    )}%, eff ${Math.round(BATTERY_EFFICIENCY * 100)}%) → ${round(requiredKwh, 1)} kWh ⇒ ${moduleCount} x ${module.kwh} kWh = ${installedKwh} kWh; ${inverterKw} kW inverter/charger.`,
  };
}

/** Size all configured energy sources against the building demand. */
export function computeSources(
  config: SourcesConfig | undefined,
  buildingDemandKva: number,
): SourcesResult | undefined {
  if (!config) return undefined;
  const out: SourcesResult = {};
  if (config.generator?.enabled) out.generator = sizeGenerator(buildingDemandKva, config.generator);
  if (config.solar?.enabled) out.solar = sizeSolar(config.solar);
  if (config.battery?.enabled) out.battery = sizeBattery(config.battery);
  return out;
}
