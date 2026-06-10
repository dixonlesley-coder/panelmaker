/**
 * Enclosure temperature-rise verification and IP-rating recommendation (pure).
 *
 * Applies the IEC 60890 simplified power-balance method (referenced by
 * IEC 61439-1 §9.3.2) to estimate the steady-state internal air-temperature rise
 * of an assembly: the internal heat loss is shed through the exposed enclosure
 * faces by natural convection and radiation, so
 *
 *   ΔT ≈ Pₗₒₛₛ / (k · A_eff)
 *
 * where `k` is the surface heat-transfer coefficient and `A_eff` is the effective
 * dissipating area. Forced ventilation (fans / fan-filter units) greatly increases
 * the effective dissipation, modelled here by a generous divisor. The internal air
 * temperature is the local ambient plus this rise; if the rise exceeds the
 * practical ceiling, ventilation is recommended.
 *
 * IP protection is recommended per IEC 60529 from the service environment.
 *
 * These are first-pass engineering estimates for sizing/cooling decisions — verify
 * against measured device losses, the manufacturer's enclosure data and PUIL 2011.
 */

import {
  ENCLOSURE_HEAT_DISSIPATION_W_PER_M2K,
  MAX_INTERNAL_TEMP_RISE_K,
  effectiveAreaM2,
  recommendIp,
  type EnclosureEnvironment,
} from '../standards/enclosureThermal';
import { round } from './util';

/**
 * Heat-dissipation effectiveness multiplier applied when forced ventilation
 * (fans / fan-filter units) is fitted. A fan-cooled cabinet moves far more heat
 * per kelvin than natural convection alone; this generous factor models that as an
 * equivalent increase in dissipation (i.e. the natural-convection rise is divided
 * by it). Approximate — verify against the fan/filter manufacturer's airflow data.
 */
export const FORCED_VENTILATION_FACTOR = 2.5;

/** Indonesian-room default ambient (°C) used when no ambient is supplied. */
export const DEFAULT_AMBIENT_C = 35;

/** Result of an enclosure thermal verification (this module's own type). */
export interface EnclosureThermalResult {
  /** Effective heat-dissipating surface area used in the balance (m²). */
  effectiveAreaM2: number;
  /** Total internal heat loss dissipated (W). */
  totalHeatW: number;
  /** Estimated internal air-temperature rise over ambient (K). */
  tempRiseK: number;
  /** Estimated internal air temperature: ambient + rise (°C). */
  internalTempC: number;
  /** True when the rise is within the allowable design ceiling. */
  withinLimit: boolean;
  /** True when (natural) cooling is insufficient and ventilation is advised. */
  ventilationRecommended: boolean;
  /** Recommended ingress protection (IEC 60529): code + rationale. */
  ip: { code: string; note: string };
  /** Human-readable summary of the verification outcome. */
  note: string;
  /** Governing standard clause reference. */
  clause: string;
}

/** Inputs for {@link verifyEnclosureThermal}. */
export interface EnclosureThermalInput {
  /** Enclosure width (mm). */
  widthMm: number;
  /** Enclosure height (mm). */
  heightMm: number;
  /** Enclosure depth (mm). */
  depthMm: number;
  /** Total internal heat dissipation from all mounted gear (W). */
  totalHeatW: number;
  /** Mounting type (default `wall`): governs which face is obstructed. */
  mounting?: 'wall' | 'free-standing';
  /** Ambient air temperature around the enclosure (°C, default 35 — Indonesian). */
  ambientC?: number;
  /** Service environment for the IP recommendation (default `indoor`). */
  environment?: EnclosureEnvironment;
  /** Whether forced ventilation (fans / fan-filter units) is fitted. */
  forcedVentilation?: boolean;
}

/**
 * Verify an enclosure's temperature rise (IEC 60890 / IEC 61439-1 §9.3.2) and
 * recommend an IP rating (IEC 60529).
 *
 * The natural-convection rise is `totalHeatW / (k · A_eff)`; when forced
 * ventilation is fitted the rise is reduced by {@link FORCED_VENTILATION_FACTOR}
 * to model the added airflow. The internal air temperature is `ambient + rise`.
 * The result is `withinLimit` when the rise does not exceed
 * `MAX_INTERNAL_TEMP_RISE_K`, and ventilation is recommended when the rise is over
 * the limit and no forced ventilation is already present.
 *
 * @param input Enclosure geometry, heat load and environment.
 * @returns The {@link EnclosureThermalResult} verification.
 */
export function verifyEnclosureThermal(input: EnclosureThermalInput): EnclosureThermalResult {
  const {
    widthMm,
    heightMm,
    depthMm,
    totalHeatW,
    mounting = 'wall',
    ambientC = DEFAULT_AMBIENT_C,
    environment = 'indoor',
    forcedVentilation = false,
  } = input;

  const area = effectiveAreaM2(widthMm, heightMm, depthMm, mounting);
  const heat = Math.max(0, totalHeatW);

  // Power-balance rise; guard against a degenerate (zero-area) enclosure.
  const naturalRiseK =
    area > 0 ? heat / (ENCLOSURE_HEAT_DISSIPATION_W_PER_M2K * area) : Number.POSITIVE_INFINITY;
  const tempRiseK = forcedVentilation ? naturalRiseK / FORCED_VENTILATION_FACTOR : naturalRiseK;

  const internalTempC = ambientC + tempRiseK;
  const withinLimit = tempRiseK <= MAX_INTERNAL_TEMP_RISE_K;
  const ventilationRecommended = !withinLimit && !forcedVentilation;

  const ip = recommendIp(environment);

  const note = withinLimit
    ? `Internal air rise ~${round(tempRiseK)} K (<= ${MAX_INTERNAL_TEMP_RISE_K} K) — within limit; ` +
      `internal air ~${round(internalTempC)} °C at ${round(ambientC)} °C ambient.`
    : ventilationRecommended
      ? `Internal air rise ~${round(tempRiseK)} K exceeds ${MAX_INTERNAL_TEMP_RISE_K} K — ` +
        `add ventilation/cooling or a larger enclosure (internal air ~${round(internalTempC)} °C).`
      : `Internal air rise ~${round(tempRiseK)} K exceeds ${MAX_INTERNAL_TEMP_RISE_K} K even with ` +
        `forced ventilation — increase cooling capacity (internal air ~${round(internalTempC)} °C).`;

  return {
    effectiveAreaM2: round(area, 3),
    totalHeatW: round(heat, 1),
    tempRiseK: round(tempRiseK),
    internalTempC: round(internalTempC),
    withinLimit,
    ventilationRecommended,
    ip,
    note,
    clause: 'IEC 61439-1 §9.3.2 / IEC 60890 (temp-rise); IEC 60529 (IP)',
  };
}
