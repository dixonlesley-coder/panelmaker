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
  BATTERY_DISCHARGE_EFFICIENCY,
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
import { assessGensetStart, type GensetMotor } from './gensetTransient';
import { round } from './util';

/** Which panels the genset actually backs: marked essential panels, or a blanket fraction. */
export interface EssentialDemand {
  /** Aggregate demand of the marked essential panels (kVA, double-count free). */
  demandKva: number;
  /** How many panels are marked (0 = none — fall back to backupFraction). */
  panelCount: number;
}

/**
 * Size a standby/prime generator. When essential panels are marked, the backup
 * demand is THEIR actual aggregate demand (the real essential bus the ATS
 * transfers); otherwise fall back to `backupFraction` × the building demand.
 */
export function sizeGenerator(
  buildingDemandKva: number,
  cfg: GeneratorConfig,
  essential?: EssentialDemand,
): GeneratorResult {
  const useEssential = essential !== undefined && essential.panelCount > 0;
  const backupKva = useEssential ? essential.demandKva : buildingDemandKva * cfg.backupFraction;
  // Prime (continuous) duty needs ~25% headroom; standby covers the backup load directly.
  const required = cfg.mode === 'prime' ? backupKva * 1.25 : backupKva;
  const ratingKva = selectGeneratorKva(required);
  const duty = cfg.mode === 'prime' ? 'Prime (continuous)' : 'Standby';
  return {
    ratingKva,
    backupKva: round(backupKva, 1),
    mode: cfg.mode,
    ...(useEssential ? { essentialPanelCount: essential.panelCount } : {}),
    note: useEssential
      ? `${duty} genset backing the ${essential.panelCount} essential panel(s) (${round(backupKva, 1)} kVA) → ${ratingKva} kVA. The ATS transfers the essential bus on mains failure.`
      : `${duty} genset backing up ${Math.round(cfg.backupFraction * 100)}% of demand (${round(backupKva, 1)} kVA) → ${ratingKva} kVA. Transfers on mains failure via ATS.`,
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
  // Backup autonomy only loses the discharge path, not the full round trip.
  const requiredKwh = (cfg.backupKw * cfg.autonomyHours) / (dod * BATTERY_DISCHARGE_EFFICIENCY);
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
    )}%, discharge eff ${Math.round(BATTERY_DISCHARGE_EFFICIENCY * 100)}%) → ${round(requiredKwh, 1)} kWh ⇒ ${moduleCount} x ${module.kwh} kWh = ${installedKwh} kWh; ${inverterKw} kW inverter/charger.`,
  };
}

/** Size all configured energy sources against the building demand. */
export function computeSources(
  config: SourcesConfig | undefined,
  buildingDemandKva: number,
  motors: GensetMotor[] = [],
  essential?: EssentialDemand,
): SourcesResult | undefined {
  if (!config) return undefined;
  const out: SourcesResult = {};
  if (config.generator?.enabled) {
    out.generator = sizeGenerator(buildingDemandKva, config.generator, essential);
    // Verify the genset holds the worst-case motor-start voltage dip within limits.
    out.gensetStart = assessGensetStart({ gensetKva: out.generator.ratingKva, motors });
  }
  if (config.solar?.enabled) out.solar = sizeSolar(config.solar);
  if (config.battery?.enabled) out.battery = sizeBattery(config.battery);
  return out;
}
