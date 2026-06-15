/**
 * Transformer energisation (magnetising) inrush + the resulting voltage
 * sag/flicker on the supply.
 *
 * When a transformer is switched on, residual core flux plus the point on the
 * voltage wave at closing can drive the core deep into saturation, drawing a
 * large first-cycle MAGNETISING inrush current — many times the rated full-load
 * current. This is unrelated to the load fault current: it is a transient that
 * peaks on the first cycle and decays over roughly 0.1–0.3 s (a few hundred ms,
 * longer on large units with low losses). It can dip the supply voltage at the
 * point of common coupling (PCC) and trip upstream protection if not allowed for.
 *
 * This module is a PLANNING ESTIMATE, not a measurement. It follows the spirit
 * of IEC 60076 (power transformers — inrush is a recognised energisation duty)
 * and IEC 61000-3-3 (voltage changes, fluctuations and flicker at the PCC). The
 * inrush multiple is a typical first-peak figure for distribution units; the sag
 * is a voltage-divider approximation. VERIFY against the transformer test report
 * (inrush curve / I²t) and the utility's fault-level and flicker data.
 *
 * Pure TS: no Node, no DOM, no side effects.
 */

/**
 * IEC 61000-3-3 short-duration voltage-change limit used here as the transient
 * acceptance band for a sub-second energisation step (%). The standard's steady
 * relative voltage change dmax is ~4 %, but a single infrequent inrush event is a
 * short transient, for which a higher step (≈ 8 %) is tolerated; we adopt 8 % as
 * the planning threshold. At or below it the dip is considered acceptable.
 */
export const INRUSH_TRANSIENT_SAG_LIMIT_PCT = 8;

/**
 * Approximate decay time of the inrush transient (ms). The current peaks on the
 * first cycle and decays over ~0.1–0.3 s; we report ~200 ms as a planning figure.
 */
export const INRUSH_DURATION_MS_APPROX = 200;

/**
 * First-cycle magnetising inrush as a MULTIPLE of rated full-load current,
 * banded by transformer size. Smaller dry/distribution units saturate harder
 * (higher multiple); larger oil-filled units have proportionally lower peaks.
 *
 *   ≤ 100 kVA  → ~12×   (small dry / distribution)
 *   ≤ 630 kVA  → ~10×
 *   > 630 kVA  → ~8×    (larger oil units)
 *
 * This is a first-PEAK planning figure that decays over ~0.1–0.3 s — it is not a
 * sustained current. Verify against the unit's inrush curve / datasheet.
 */
export function inrushMultiple(kva: number): number {
  if (kva <= 100) return 12;
  if (kva <= 630) return 10;
  return 8;
}

/**
 * Lookup-style banding of the inrush multiple, exposed alongside
 * {@link inrushMultiple} for callers that prefer a table.
 */
export const INRUSH_MULTIPLE_BY_KVA: ReadonlyArray<{ maxKva: number; multiple: number }> = [
  { maxKva: 100, multiple: 12 },
  { maxKva: 630, multiple: 10 },
  { maxKva: Number.POSITIVE_INFINITY, multiple: 8 },
];

/**
 * Estimate the first-cycle magnetising inrush current of a transformer at
 * energisation.
 *
 * @param ratedCurrentA the transformer winding full-load current the inrush is
 *   referenced to (typically the secondary FLC at the LV side, but pass whichever
 *   side the sag is being assessed on).
 * @param kva the transformer rating (selects the inrush multiple band).
 * @returns the inrush multiple, the peak inrush current (A), and the approximate
 *   transient duration (ms).
 */
export function transformerInrush(opts: { ratedCurrentA: number; kva: number }): {
  multiple: number;
  inrushA: number;
  durationMsApprox: number;
} {
  const ratedCurrentA = Math.max(0, opts.ratedCurrentA);
  const multiple = inrushMultiple(opts.kva);
  return {
    multiple,
    inrushA: ratedCurrentA * multiple,
    durationMsApprox: INRUSH_DURATION_MS_APPROX,
  };
}

/**
 * Estimate the voltage sag at the point of common coupling (PCC) caused by an
 * energisation inrush, by the voltage-divider approximation:
 *
 *   sag% ≈ 100 · I_inrush / (I_inrush + I_fault_source)
 *
 * This treats the source's available fault current as a proxy for source
 * stiffness (a higher fault level = a stiffer source = a smaller dip). It assumes
 * the inrush draws current largely in phase with the equivalent source impedance;
 * the real dip depends on the X/R of source and transformer and the inrush power
 * factor, so this is an upper-ish planning estimate. Verify with the utility's
 * fault level and flicker/Pst data per IEC 61000-3-3.
 *
 * @param inrushA the peak inrush current (A) from {@link transformerInrush}.
 * @param sourceFaultLevelA the available short-circuit current at the PCC (A).
 * @returns the estimated sag (%) and whether it is within the transient limit
 *   ({@link INRUSH_TRANSIENT_SAG_LIMIT_PCT}).
 */
export function energisationSag(opts: { inrushA: number; sourceFaultLevelA: number }): {
  sagPercent: number;
  withinTransientLimit: boolean;
} {
  const inrushA = Math.max(0, opts.inrushA);
  const sourceFaultLevelA = Math.max(0, opts.sourceFaultLevelA);
  const denom = inrushA + sourceFaultLevelA;
  const sagPercent = denom > 0 ? (100 * inrushA) / denom : 0;
  return {
    sagPercent,
    withinTransientLimit: sagPercent <= INRUSH_TRANSIENT_SAG_LIMIT_PCT,
  };
}
