/**
 * Air-conditioning reference data (Indonesian "PK" ratings).
 *
 * AC units are sold by cooling capacity in **PK** (Paardekracht / "horsepower"):
 * 1 PK ≈ 9 000 BTU/h. What the panel needs is the **electrical input** (running
 * current) and the compressor **inrush** (locked-rotor) on start. This table maps
 * the common PK ratings to a representative electrical input (W) for split units
 * (1-phase) and package/VRF outdoor units (3-phase); the running current is then
 * `input / (V·cosφ)` and the start inrush ≈ {@link AC_COMPRESSOR_INRUSH} × that.
 *
 * Values are representative nameplate inputs (verify against the actual unit) —
 * inverter units draw a little less at steady state, fixed-speed a little more.
 */

export interface AcRating {
  /** Cooling capacity in PK. */
  pk: number;
  /** Representative electrical input power (W). */
  inputW: number;
}

/** Single-phase split units (wall / cassette), 0.5 PK … 3 PK. */
export const AC_PK_RATINGS_1PH: readonly AcRating[] = [
  { pk: 0.5, inputW: 400 },
  { pk: 0.75, inputW: 660 },
  { pk: 1, inputW: 840 },
  { pk: 1.5, inputW: 1170 },
  { pk: 2, inputW: 1920 },
  { pk: 2.5, inputW: 2400 },
  { pk: 3, inputW: 2800 },
];

/** Three-phase package / VRF outdoor (condensing) units, 3 PK … 20 PK. */
export const AC_PK_RATINGS_3PH: readonly AcRating[] = [
  { pk: 3, inputW: 2800 },
  { pk: 4, inputW: 3700 },
  { pk: 5, inputW: 4600 },
  { pk: 6, inputW: 5500 },
  { pk: 8, inputW: 7400 },
  { pk: 10, inputW: 9200 },
  { pk: 15, inputW: 13800 },
  { pk: 20, inputW: 18400 },
];

/**
 * Compressor start inrush as a multiple of running current (locked-rotor / rated
 * load amps). Hermetic scroll/reciprocating compressors started direct-on-line sit
 * around 4.5–6× RLA; ~5 is a representative figure. Inverter/soft-start units are
 * much lower, so this is the conservative (fixed-speed DOL) case.
 */
export const AC_COMPRESSOR_INRUSH = 5;

/** Electrical input (W) for a given PK on the chosen supply, nearest tabulated. */
export function acInputW(pk: number, threePhase: boolean): number {
  const table = threePhase ? AC_PK_RATINGS_3PH : AC_PK_RATINGS_1PH;
  let best = table[0]!;
  for (const r of table) {
    if (Math.abs(r.pk - pk) < Math.abs(best.pk - pk)) best = r;
  }
  return best.inputW;
}
