/**
 * Distributed energy source reference data: standby/prime generators, solar PV
 * arrays + inverters, and backup battery banks. Figures are typical Indonesian-
 * market values; treat them as design defaults to be confirmed against datasheets.
 */

/* ------------------------------- Generator -------------------------------- */

/** Standard genset apparent-power ratings (kVA). */
export const GENERATOR_KVA = [
  10, 15, 20, 25, 33, 40, 50, 65, 82, 100, 125, 150, 200, 250, 300, 350, 400, 500, 650, 800,
  1000, 1250, 1500, 2000, 2500,
] as const;

/** Typical genset power factor. */
export const GENERATOR_PF = 0.8;

/** Diesel specific fuel consumption (litres per kWh) — typical ~75% loading. */
export const GENSET_SFC_L_PER_KWH = 0.25;

/** Standard day-tank runtime target (hours) used to recommend a tank size. */
export const GENSET_DAY_TANK_HOURS = 8;

/** Smallest standard genset covering a required kVA. */
export function selectGeneratorKva(requiredKva: number): number {
  return GENERATOR_KVA.find((k) => k >= requiredKva) ?? GENERATOR_KVA[GENERATOR_KVA.length - 1]!;
}

/* ---------------------------------- Solar --------------------------------- */

export interface PvPanel {
  wp: number;
  /** Voltage at max power (V). */
  vmp: number;
  /** Current at max power (A). */
  imp: number;
  /** Open-circuit voltage (V). */
  voc: number;
  /** Short-circuit current (A). */
  isc: number;
}

/** A typical 550 Wp monocrystalline panel. */
export const PV_PANEL_DEFAULT: PvPanel = { wp: 550, vmp: 41.7, imp: 13.2, voc: 49.5, isc: 14.0 };

/** MPPT operating window and system limits for a 1000 V string inverter (V). */
export const MPPT_VMIN = 200;
export const MPPT_VMAX = 850;
export const MAX_SYSTEM_VOLTAGE = 1000;
/** Cold-temperature Voc rise factor used when checking the max-voltage limit. */
export const VOC_COLD_FACTOR = 1.15;

/** Indonesian average peak-sun-hours per day. */
export const PEAK_SUN_HOURS = 4.8;
/** Overall PV performance ratio (soiling, temperature, wiring, inverter). */
export const PV_PERFORMANCE_RATIO = 0.8;
/** Default DC/AC (array-to-inverter) oversizing ratio. */
export const DC_AC_RATIO = 1.2;

/** Standard inverter AC ratings (kW), used for both PV and battery inverters. */
export const INVERTER_KW = [
  3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250,
] as const;

/** Smallest standard inverter covering a required kW. */
export function selectInverterKw(requiredKw: number): number {
  return INVERTER_KW.find((k) => k >= requiredKw) ?? INVERTER_KW[INVERTER_KW.length - 1]!;
}

/* --------------------------------- Battery -------------------------------- */

export interface BatteryModule {
  kwh: number;
  voltage: number;
  ah: number;
}

/** A typical 5.12 kWh (51.2 V / 100 Ah) LiFePO4 module. */
export const BATTERY_MODULE_LFP: BatteryModule = { kwh: 5.12, voltage: 51.2, ah: 100 };

export type BatteryChemistry = 'lifepo4' | 'lead_acid';

/** Usable depth-of-discharge by chemistry. */
export const DEPTH_OF_DISCHARGE: Readonly<Record<BatteryChemistry, number>> = {
  lifepo4: 0.9,
  lead_acid: 0.5,
};

/** Round-trip (charge → store → discharge + inverter) efficiency, for arbitrage. */
export const BATTERY_EFFICIENCY = 0.9;

/**
 * One-way discharge-path efficiency (battery DC → inverter → AC load). Backup
 * autonomy sizing only incurs the discharge side, so applying the full round-trip
 * efficiency here would double-count the charging loss. ~0.95 for a modern
 * battery inverter at backup load.
 */
export const BATTERY_DISCHARGE_EFFICIENCY = 0.95;
