/**
 * Prospective touch-voltage assessment for TT earthing systems.
 *
 * In a TT system an exposed-conductive-part fault returns to the source through
 * the installation earth electrode (resistance RA) in series with the source
 * earth electrode. The prospective touch voltage during the fault, before the
 * protective RCD disconnects, is approximately the rise of the installation
 * electrode: U_touch ≈ RA · IΔn, where IΔn is the rated residual operating
 * current of the protective RCD.
 *
 * IEC 60364-4-41 §411.5.3 sets the TT protection condition:
 *
 *     RA · IΔn ≤ 50 V
 *
 * where 50 V is the conventional touch-voltage limit U_L for dry/normal
 * locations. Satisfying it guarantees the touch voltage stays at or below the
 * limit when the RCD operates.
 *
 * This applies ONLY to TT systems. In TN systems automatic disconnection is
 * achieved by the overcurrent/RCD device acting on the (low) earth-fault loop
 * impedance Zs, assessed elsewhere (see the fault / Zs disconnection analysis),
 * not by the RA·IΔn condition.
 *
 * Pure, DOM/Node-free — runs identically in the renderer and the main process.
 */

/**
 * Conventional touch-voltage limit U_L (V) for dry/normal conditions, per
 * IEC 60364-4-41 (50 V AC). Reduced limits (e.g. 25 V) apply to special
 * locations but are not modelled here.
 */
export const TOUCH_VOLTAGE_LIMIT_V = 50;

/** Input to {@link touchVoltageTT}. */
export interface TouchVoltageInput {
  /** Installation earth-electrode resistance RA (Ω). */
  electrodeResistanceOhm: number;
  /** Rated residual operating current IΔn of the protective RCD (mA). */
  rcdRatingMa: number;
}

/** Result of a TT touch-voltage assessment. */
export interface TouchVoltageResult {
  /** Prospective touch voltage during the fault, U_touch ≈ RA · IΔn (V). */
  touchVoltageV: number;
  /** Conventional limit U_L applied (V). */
  limitV: number;
  /** True when U_touch ≤ limit (the §411.5.3 condition is satisfied). */
  ok: boolean;
  /** Largest electrode resistance RA that still satisfies the condition for this RCD (Ω). */
  maxElectrodeOhm: number;
}

/**
 * Assess the prospective touch voltage of a TT installation against the
 * IEC 60364-4-41 §411.5.3 condition RA · IΔn ≤ 50 V.
 *
 * @param opts Installation electrode resistance RA (Ω) and protective RCD rated
 *   residual operating current IΔn (mA).
 * @returns {@link TouchVoltageResult} — the prospective touch voltage, the limit,
 *   pass/fail, and the maximum permissible electrode resistance for the RCD.
 */
export function touchVoltageTT(opts: TouchVoltageInput): TouchVoltageResult {
  const rcdRatingA = opts.rcdRatingMa / 1000;
  const touchVoltageV = opts.electrodeResistanceOhm * rcdRatingA;
  const maxElectrodeOhm = rcdRatingA > 0 ? TOUCH_VOLTAGE_LIMIT_V / rcdRatingA : Infinity;
  return {
    touchVoltageV,
    limitV: TOUCH_VOLTAGE_LIMIT_V,
    ok: touchVoltageV <= TOUCH_VOLTAGE_LIMIT_V,
    maxElectrodeOhm,
  };
}
