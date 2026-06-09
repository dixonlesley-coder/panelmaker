/**
 * Electricity tariff & distributed-energy economics reference data.
 *
 * Figures follow Indonesian PLN (Perusahaan Listrik Negara) non-subsidised
 * business/industrial tariffs and typical EPC market prices; they are design
 * defaults to be confirmed against the current PLN tariff adjustment and live
 * supplier quotations. All monetary values are in Indonesian Rupiah (IDR).
 */

/** Supply-voltage tariff class: low voltage (≤200 kVA) vs medium voltage (20 kV). */
export type TariffClass = 'LV' | 'MV';

/**
 * Typical PLN energy charge (IDR per kWh) by supply class. MV customers buy at a
 * lower per-kWh rate but own the transformer (and its losses). Roughly the
 * 2024-2025 non-subsidised B-3/I-3 adjustment band.
 */
export const TARIFF_IDR_PER_KWH: Readonly<Record<TariffClass, number>> = {
  LV: 1450,
  MV: 1115,
};

/** Default energy charge when the class is unknown (LV business rate, IDR/kWh). */
export const DEFAULT_TARIFF_IDR_PER_KWH = TARIFF_IDR_PER_KWH.LV;

/** Resolve the energy charge (IDR/kWh) for a supply class, default LV. */
export function tariffForClass(cls: TariffClass = 'LV'): number {
  return TARIFF_IDR_PER_KWH[cls] ?? DEFAULT_TARIFF_IDR_PER_KWH;
}

/* ---------------------------- Solar / battery capex ----------------------------- */

/** Turn-key installed cost of grid-tied PV, IDR per kWp (modules + inverter + BOS + install). */
export const SOLAR_CAPEX_IDR_PER_KWP = 12_000_000;

/** Installed cost of battery storage, IDR per kWh of installed capacity. */
export const BATTERY_CAPEX_IDR_PER_KWH = 6_000_000;

/** Nominal economic/operational life of a PV system (years), for lifetime-value. */
export const SOLAR_LIFETIME_YEARS = 25;

/** Transformer no-load (iron/core) loss as a fraction of nameplate kVA. */
export const TRANSFORMER_NO_LOAD_LOSS_PCT = 0.002; // ~0.2% of kVA

/** Transformer full-load (copper/winding) loss as a fraction of nameplate kVA. */
export const TRANSFORMER_LOAD_LOSS_PCT = 0.01; // ~1% of kVA at full load, scales with loading²
