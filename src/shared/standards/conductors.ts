/**
 * Conductor reference data — PUIL 2011 (SNI 0225:2011) Table 7.3-x, harmonized
 * with IEC 60364-5-52. Copper conductors, PVC insulation.
 *
 * All ampacities (KHA, "Kemampuan Hantar Arus") are in Amperes for the reference
 * installation method (insulated conductors in conduit, 30 degC ambient, single
 * circuit). Other installation methods and conditions are handled as derating
 * factors in `derating` (see `INSTALL_METHOD_FACTORS`, `AMBIENT_TEMP_FACTORS`,
 * `GROUPING_FACTORS`).
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

/** Base KHA for a standard section (A). Returns 0 for an unknown section. */
export function baseKha(sectionMm2: number): number {
  return KHA_COPPER_PVC[sectionMm2] ?? 0;
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

/** Resistance (ohm/km) for a section, falling back to a resistivity estimate. */
export function conductorResistanceOhmPerKm(sectionMm2: number): number {
  const tabulated = CONDUCTOR_R_OHM_PER_KM[sectionMm2];
  if (tabulated !== undefined) return tabulated;
  // rho_copper ~= 0.0225 ohm.mm^2/m at operating temperature -> ohm/km
  return (0.0225 / sectionMm2) * 1000;
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

/** Installation-method multipliers applied to the reference (conduit) KHA. */
export const INSTALL_METHOD_FACTORS: Readonly<Record<string, number>> = {
  conduit: 1.0,
  trunking: 1.0,
  wall: 1.0,
  air: 1.1,
  tray: 1.05,
  buried: 0.9,
};
