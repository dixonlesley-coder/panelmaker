/**
 * Conductor reference data — PUIL 2011 (SNI 0225:2011) Table 7.3-x, harmonized
 * with IEC 60364-5-52. Copper conductors, PVC insulation.
 *
 * All ampacities (KHA, "Kemampuan Hantar Arus") are in Amperes. The base tables
 * are the reference method B1 (in conduit on a wall, 30 degC ambient, single
 * circuit); other installation methods use their own per-method IEC tables via
 * `khaFor` (the table SHAPES differ by method — a flat multiplier cannot
 * represent buried vs free-air behaviour). Ambient, grouping and soil-thermal
 * conditions remain multiplicative factors in `derating`.
 */

/** Standard copper conductor cross-sectional areas (mm^2), ascending. */
export const STANDARD_SECTIONS_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
] as const;

export type StandardSection = (typeof STANDARD_SECTIONS_MM2)[number];

/**
 * Base KHA (current carrying capacity) in Amperes, copper / PVC, reference
 * method (in conduit, 30 degC). Values ~aligned with PUIL 2011 Table 7.3-1 and
 * IEC 60364-5-52 reference method B.
 */
export const KHA_COPPER_PVC: Readonly<Record<number, number>> = {
  1.5: 17,
  2.5: 24,
  4: 32,
  6: 41,
  10: 57,
  16: 76,
  25: 101,
  35: 125,
  50: 151,
  70: 192,
  95: 232,
  120: 269,
  150: 309,
  185: 353,
  240: 415,
  300: 477,
};

/**
 * Base KHA, copper / XLPE (90 °C), same reference method (in conduit, 30 degC).
 * ~Aligned with IEC 60364-5-52 Table B.52.4 (method B1) — XLPE's higher
 * operating temperature buys roughly 25-30% over PVC at equal section.
 */
export const KHA_COPPER_XLPE: Readonly<Record<number, number>> = {
  1.5: 20,
  2.5: 28,
  4: 37,
  6: 48,
  10: 66,
  16: 88,
  25: 117,
  35: 144,
  50: 175,
  70: 222,
  95: 269,
  120: 312,
  150: 358,
  185: 408,
  240: 481,
  300: 553,
};

/**
 * IEC 60364-5-52 reference installation methods the app distinguishes:
 *   B1 — conductors/cable in conduit or trunking on a wall (the base tables);
 *   C  — multicore cable clipped direct to a wall/surface;
 *   E  — multicore cable in free air / on perforated tray;
 *   D  — multicore cable buried in the ground (ducts or direct).
 */
export type RefMethod = 'B1' | 'C' | 'E' | 'D';

/** App install method → IEC reference method whose ampacity table applies. */
export const REF_METHOD_FOR_INSTALL: Readonly<Record<string, RefMethod>> = {
  conduit: 'B1',
  trunking: 'B1',
  wall: 'C',
  air: 'E',
  tray: 'E',
  buried: 'D',
};

/**
 * Per-method copper/PVC ampacities (A), multicore 3-loaded, 30 °C air / 20 °C
 * ground — ~aligned with IEC 60364-5-52 Tables B.52.2/B.52.4/B.52.5. Note the
 * SHAPES differ: buried (D) beats conduit at small sections (soil is a good
 * heat sink) but falls to ~70% at 300 mm² — a flat method factor cannot
 * represent this. B1 is {@link KHA_COPPER_PVC}.
 */
export const KHA_CU_PVC_BY_METHOD: Readonly<Record<Exclude<RefMethod, 'B1'>, Readonly<Record<number, number>>>> = {
  C: {
    1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138,
    50: 168, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461, 300: 530,
  },
  E: {
    1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 70, 16: 94, 25: 119, 35: 148,
    50: 180, 70: 232, 95: 282, 120: 328, 150: 379, 185: 434, 240: 514, 300: 593,
  },
  D: {
    1.5: 18, 2.5: 24, 4: 30, 6: 38, 10: 50, 16: 64, 25: 82, 35: 98,
    50: 116, 70: 143, 95: 169, 120: 192, 150: 217, 185: 243, 240: 280, 300: 316,
  },
};

/** Per-method copper/XLPE ampacities (A) — see {@link KHA_CU_PVC_BY_METHOD}. */
export const KHA_CU_XLPE_BY_METHOD: Readonly<Record<Exclude<RefMethod, 'B1'>, Readonly<Record<number, number>>>> = {
  C: {
    1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171,
    50: 209, 70: 269, 95: 328, 120: 382, 150: 441, 185: 506, 240: 599, 300: 693,
  },
  E: {
    1.5: 26, 2.5: 36, 4: 49, 6: 63, 10: 86, 16: 115, 25: 149, 35: 185,
    50: 225, 70: 289, 95: 352, 120: 410, 150: 473, 185: 542, 240: 641, 300: 741,
  },
  D: {
    1.5: 21, 2.5: 28, 4: 36, 6: 44, 10: 58, 16: 75, 25: 96, 35: 115,
    50: 135, 70: 167, 95: 197, 120: 223, 150: 251, 185: 281, 240: 324, 300: 365,
  },
};

/**
 * Aluminum ampacity as a fraction of copper at equal section (~IEC 60364-5-52
 * Al columns ÷ Cu columns). Aluminum's higher resistivity means ~78% of the
 * copper rating for the same cross-section.
 */
export const AL_AMPACITY_RATIO = 0.78;

/** Smallest practical aluminum conductor (mm²) — NAYY/NA2XY start at 16. */
export const AL_MIN_SECTION_MM2 = 16;

/** Aluminum/copper resistance ratio (ρAl ≈ 0.036 vs ρCu ≈ 0.0225 Ω·mm²/m). */
export const AL_RESISTANCE_RATIO = 1.61;

/** Base KHA for a standard section (A) by insulation. Returns 0 if unknown. */
export function baseKha(sectionMm2: number, insulation: 'PVC' | 'XLPE' = 'PVC'): number {
  const table = insulation === 'XLPE' ? KHA_COPPER_XLPE : KHA_COPPER_PVC;
  return table[sectionMm2] ?? 0;
}

export interface KhaLookup {
  insulation?: 'PVC' | 'XLPE';
  material?: 'Cu' | 'Al';
  /** App install method (conduit/trunking/wall/air/tray/buried). */
  installMethod?: string;
}

/**
 * Ampacity (A) for a section under the actual installation method, insulation
 * and conductor material — the per-method IEC table replaces the old flat
 * method multiplier. Aluminum applies {@link AL_AMPACITY_RATIO} to the copper
 * value. Returns 0 for an unknown section.
 */
export function khaFor(sectionMm2: number, opts: KhaLookup = {}): number {
  const insulation = opts.insulation ?? 'PVC';
  const method = REF_METHOD_FOR_INSTALL[opts.installMethod ?? 'conduit'] ?? 'B1';
  let kha: number;
  if (method === 'B1') {
    kha = baseKha(sectionMm2, insulation);
  } else {
    const byMethod = insulation === 'XLPE' ? KHA_CU_XLPE_BY_METHOD : KHA_CU_PVC_BY_METHOD;
    kha = byMethod[method][sectionMm2] ?? 0;
  }
  return (opts.material ?? 'Cu') === 'Al' ? kha * AL_AMPACITY_RATIO : kha;
}

/**
 * AC resistance of copper conductors, ohm/km at ~70 degC operating temperature
 * (IEC 60909 / manufacturer data). Used for voltage-drop calculations.
 */
export const CONDUCTOR_R_OHM_PER_KM: Readonly<Record<number, number>> = {
  1.5: 14.5,
  2.5: 8.87,
  4: 5.52,
  6: 3.69,
  10: 2.19,
  16: 1.38,
  25: 0.87,
  35: 0.627,
  50: 0.463,
  70: 0.321,
  95: 0.232,
  120: 0.184,
  150: 0.15,
  185: 0.121,
  240: 0.0930,
  300: 0.0752,
};

/** Typical reactance for LV cables, ohm/km. Small and roughly section-independent. */
export const CONDUCTOR_X_OHM_PER_KM = 0.08;

/** Resistance (ohm/km) for a section + material, falling back to a resistivity estimate. */
export function conductorResistanceOhmPerKm(sectionMm2: number, material: 'Cu' | 'Al' = 'Cu'): number {
  const tabulated = CONDUCTOR_R_OHM_PER_KM[sectionMm2];
  // rho_copper ~= 0.0225 ohm.mm^2/m at operating temperature -> ohm/km
  const cu = tabulated !== undefined ? tabulated : (0.0225 / sectionMm2) * 1000;
  return material === 'Al' ? cu * AL_RESISTANCE_RATIO : cu;
}

/**
 * Ambient temperature correction factors for PVC insulation (base 30 degC),
 * IEC 60364-5-52 Table B.52.14. Interpolated linearly between tabulated points.
 */
export const AMBIENT_TEMP_FACTORS: Readonly<Record<number, number>> = {
  10: 1.22,
  15: 1.17,
  20: 1.12,
  25: 1.06,
  30: 1.0,
  35: 0.94,
  40: 0.87,
  45: 0.79,
  50: 0.71,
  55: 0.61,
  60: 0.5,
};

/**
 * Ambient temperature correction factors for XLPE insulation (90 °C, base
 * 30 degC), IEC 60364-5-52 Table B.52.14. XLPE's larger headroom to its limit
 * temperature derates more gently than PVC.
 */
export const AMBIENT_TEMP_FACTORS_XLPE: Readonly<Record<number, number>> = {
  10: 1.15,
  15: 1.12,
  20: 1.08,
  25: 1.04,
  30: 1.0,
  35: 0.96,
  40: 0.91,
  45: 0.87,
  50: 0.82,
  55: 0.76,
  60: 0.71,
};

/**
 * Grouping (bunching) correction factors for circuits grouped together in
 * conduit/trunking, IEC 60364-5-52 Table B.52.17.
 */
export const GROUPING_FACTORS: Readonly<Record<number, number>> = {
  1: 1.0,
  2: 0.8,
  3: 0.7,
  4: 0.65,
  5: 0.6,
  6: 0.57,
  7: 0.54,
  8: 0.52,
  9: 0.5,
};

/**
 * Soil thermal-resistivity correction for BURIED cables (IEC 60364-5-52
 * Table B.52.16, ducts in ground), applied on top of the `buried` method factor.
 * The IEC reference is 2.5 K·m/W; wetter soil conducts heat better (>1), dry /
 * volcanic ash soils insulate the cable and derate it (<1). Interpolated.
 */
export const SOIL_THERMAL_RESISTIVITY_FACTORS: Readonly<Record<number, number>> = {
  1: 1.18,
  1.5: 1.1,
  2: 1.05,
  2.5: 1.0,
  3: 0.96,
};

/** IEC reference soil thermal resistivity (K·m/W) — factor 1.0. */
export const SOIL_THERMAL_RESISTIVITY_REFERENCE_KMW = 2.5;
