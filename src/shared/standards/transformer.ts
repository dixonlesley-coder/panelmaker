/**
 * Supply / transformer reference data.
 *
 * In Indonesia, PLN low-voltage (220/380-400 V) connections are limited to
 * ~200 kVA. Above that the supply is taken at medium voltage (20 kV) and stepped
 * down through a distribution transformer in a substation, fed from an MV panel
 * (cubicle: incoming + metering + transformer feeder).
 */

/** Maximum demand (kVA) served at low voltage before MV + transformer is needed. */
export const LV_SUPPLY_LIMIT_KVA = 200;

/** Standard Indonesian MV distribution voltage (V). */
export const MV_VOLTAGE_V = 20000;

/** Standard distribution transformer ratings (kVA). */
export const TRANSFORMER_KVA = [
  25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500,
] as const;

/** Transformers are loaded to ~80% of nameplate for headroom and losses. */
export const TRANSFORMER_LOADING_FACTOR = 0.8;

/**
 * Assumed building power factor used to translate diversified real demand (kW)
 * into apparent demand (kVA = kW / PF) when sizing the supply/transformer. It is
 * the single source of truth for this round-trip: the energy module reuses it to
 * recover the delivered kW (kVA × PF) when expressing losses as a fraction of the
 * actual load, so the two never drift apart.
 */
export const ASSUMED_BUILDING_PF = 0.85;

/** Typical short-circuit impedance of a distribution transformer (%). */
export const TRANSFORMER_IMPEDANCE_PCT = 4;

/** Smallest standard transformer kVA covering a required rating. */
export function selectTransformerKva(requiredKva: number): number {
  return TRANSFORMER_KVA.find((k) => k >= requiredKva) ?? TRANSFORMER_KVA[TRANSFORMER_KVA.length - 1]!;
}

/** Transformer full-load current on a winding at a given line voltage (A). */
export function transformerFlc(kva: number, voltageV: number): number {
  if (voltageV <= 0) return 0;
  return (kva * 1000) / (Math.sqrt(3) * voltageV);
}
