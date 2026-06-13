/**
 * IEC 62305-2 lightning risk reference data (simplified frequency method).
 *
 * Whether a structure needs a Lightning Protection System (LPS) is decided by
 * comparing the expected number of dangerous events per year `Nd` (from the
 * collection area and the local ground flash density) against a tolerable
 * frequency `Nc`. When `Nd > Nc` an LPS is required and the protection
 * EFFICIENCY `E = 1 − Nc/Nd` maps to a protection level I–IV.
 *
 * These are design defaults — a full IEC 62305-2 risk study (R1…R4 with all loss
 * components) is a separate exercise; this is the screening every panel/building
 * designer does first.
 */

/**
 * National default ground flash density Ng (flashes/km²/year). Indonesia sits in
 * the equatorial maximum (very high keraunic level); a conservative default.
 */
export const DEFAULT_GROUND_FLASH_DENSITY = 12;

/**
 * Tolerable frequency of dangerous events Nc (events/year) for an ordinary
 * structure with risk of loss of human life — the screening threshold.
 */
export const TOLERABLE_EVENTS_PER_YEAR = 1e-3;

/** LPS protection levels in descending required efficiency. */
export type LpsLevel = 'I' | 'II' | 'III' | 'IV';

/**
 * Map the required protection efficiency E to an LPS level (IEC 62305-1 Table 6
 * efficiencies: I ≈ 0.98, II ≈ 0.95, III ≈ 0.90, IV ≈ 0.80). `null` when no LPS
 * is required (E ≤ 0).
 */
export function lpsLevelForEfficiency(E: number): LpsLevel | null {
  if (E <= 0) return null;
  if (E > 0.95) return 'I';
  if (E > 0.9) return 'II';
  if (E > 0.8) return 'III';
  return 'IV';
}
