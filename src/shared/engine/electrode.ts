/**
 * Earth-electrode (grounding-electrode) design from soil resistivity.
 *
 * Computes the resistance to earth of a single driven rod, then the number of
 * parallel rods needed to reach the target electrode resistance (PUIL 2011 §3
 * target of 5 Ω by default). Pure, DOM/Node-free — runs identically in the
 * renderer and the main process.
 *
 * Method:
 *  - Single driven rod (Dwight / IEEE Std 142, "Green Book"):
 *      R = ρ / (2π·L) · (ln(8L/d) − 1),  with L (length) and d (diameter) in m.
 *  - n vertical rods in parallel, spaced s ≈ one rod-length apart, with a
 *    utilisation/combining factor η (< 1) that accounts for mutual resistance
 *    (BS 7430 §9.5):  R_n = R_single / (n · η).
 *
 * Results are first-pass estimates; the achieved resistance is dominated by the
 * true on-site soil resistivity, which should be confirmed by a Wenner survey.
 */

import {
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_LENGTH_M,
  DEFAULT_ROD_UTILISATION,
  ROD_UTILISATION,
  TARGET_ELECTRODE_OHM,
} from '../standards/soil';

/** Result of an earth-electrode design. */
export interface ElectrodeResult {
  /** Resistance to earth of one driven rod (Ω). */
  singleRodOhm: number;
  /** Number of parallel rods chosen to meet (or best approach) the target. */
  rodCount: number;
  /** Achieved resistance of the rod array (Ω). */
  achievedOhm: number;
  /** Rod length used (m). */
  rodLengthM: number;
  /** Rod diameter used (mm). */
  rodDiameterMm: number;
  /** Rod-to-rod spacing used (m). */
  spacingM: number;
  /** Soil resistivity used (Ω·m). */
  soilResistivityOhmM: number;
  /** True when the achieved resistance is at or below the target. */
  meetsTarget: boolean;
  /** Human-readable layout note. */
  note: string;
  /** Standards clause reference. */
  clause: string;
}

/** Input to {@link designElectrode}. */
export interface ElectrodeInput {
  /** Soil resistivity ρ (Ω·m). */
  soilResistivityOhmM: number;
  /** Driven-rod length (m). Default 3.0 m. */
  rodLengthM?: number;
  /** Rod diameter (mm). Default 16 mm. */
  rodDiameterMm?: number;
  /** Target electrode resistance (Ω). Default 5 Ω (PUIL 2011 §3). */
  targetOhm?: number;
  /** Rod-to-rod spacing (m). Default = rod length. */
  spacingM?: number;
}

const CLAUSE = 'IEC 60364-5-54 / BS 7430 §9 / PUIL 2011 §3';

/**
 * Utilisation/combining factor η for n parallel rods (~one rod-length apart),
 * interpolated from the {@link ROD_UTILISATION} table. Counts above the table's
 * largest entry clamp to its last value; a single rod is η = 1.
 */
function utilisationFactor(count: number): number {
  if (count <= 1) return 1;
  const table = ROD_UTILISATION;
  const last = table[table.length - 1];
  if (!last) return DEFAULT_ROD_UTILISATION;
  if (count >= last.count) return last.eta;

  // Linear interpolation between the bracketing table entries.
  for (let i = 0; i < table.length - 1; i++) {
    const lo = table[i];
    const hi = table[i + 1];
    if (!lo || !hi) continue;
    if (count >= lo.count && count <= hi.count) {
      const span = hi.count - lo.count;
      if (span === 0) return lo.eta;
      const frac = (count - lo.count) / span;
      return lo.eta + frac * (hi.eta - lo.eta);
    }
  }
  return DEFAULT_ROD_UTILISATION;
}

/**
 * Resistance of a single driven vertical rod to earth (Dwight / IEEE 142).
 *
 * @param rho   Soil resistivity ρ (Ω·m).
 * @param lengthM Rod length L (m).
 * @param diaMm   Rod diameter d (mm).
 * @returns Resistance (Ω).
 */
export function singleRodResistance(rho: number, lengthM: number, diaMm: number): number {
  const L = Math.max(lengthM, 0.1);
  const d = Math.max(diaMm, 1) / 1000; // mm → m
  return (rho / (2 * Math.PI * L)) * (Math.log((8 * L) / d) - 1);
}

/**
 * Design an earth-electrode array: size a single rod, then find the minimum
 * number of parallel rods needed to reach the target resistance.
 *
 * @param input See {@link ElectrodeInput}.
 * @returns {@link ElectrodeResult}.
 */
export function designElectrode(input: ElectrodeInput): ElectrodeResult {
  const rodLengthM = input.rodLengthM ?? DEFAULT_ROD_LENGTH_M;
  const rodDiameterMm = input.rodDiameterMm ?? DEFAULT_ROD_DIAMETER_MM;
  const targetOhm = input.targetOhm ?? TARGET_ELECTRODE_OHM;
  const spacingM = input.spacingM ?? rodLengthM;
  const rho = input.soilResistivityOhmM;

  const singleRodOhm = singleRodResistance(rho, rodLengthM, rodDiameterMm);

  // Minimum rod count to reach the target, using a representative η (≈ 0.8 for
  // several rods one rod-length apart): n ≥ R_single / (target · η).
  const etaNominal = DEFAULT_ROD_UTILISATION;
  const rawCount = Math.ceil(singleRodOhm / (targetOhm * etaNominal));
  const rodCount = Math.max(1, Number.isFinite(rawCount) ? rawCount : 1);

  // Achieved resistance with the count-specific utilisation factor.
  const eta = utilisationFactor(rodCount);
  const achievedOhm = singleRodOhm / (rodCount * eta);

  const meetsTarget = achievedOhm <= targetOhm;

  const r1 = round(singleRodOhm);
  const rn = round(achievedOhm);
  const note =
    rodCount === 1
      ? `1 rod of ${rodLengthM} m × ${rodDiameterMm} mm in ${rho} Ω·m soil → ${rn} Ω` +
        (meetsTarget
          ? ` (≤ ${targetOhm} Ω target).`
          : ` (above ${targetOhm} Ω target; add rods or use chemical/ring electrode).`)
      : `${rodCount} rods of ${rodLengthM} m, spaced ${spacingM} m, in parallel ` +
        `(single rod ${r1} Ω) → ${rn} Ω` +
        (meetsTarget
          ? ` (≤ ${targetOhm} Ω target).`
          : ` (still above ${targetOhm} Ω target; survey soil / extend array).`);

  return {
    singleRodOhm,
    rodCount,
    achievedOhm,
    rodLengthM,
    rodDiameterMm,
    spacingM,
    soilResistivityOhmM: rho,
    meetsTarget,
    note,
    clause: CLAUSE,
  };
}

/** Round to two decimals for display strings (not the numeric result fields). */
function round(x: number): number {
  return Math.round(x * 100) / 100;
}
