/**
 * Buried-cable derating: ground temperature and depth of laying.
 *
 * IEC 60364-5-52 Table B.52.15 (ground ambient correction, reference 20 °C) and
 * the standard's depth-of-laying correction for cables in ducts / direct-buried.
 *
 * These factors multiply the IN-GROUND base ampacity (IEC reference method D /
 * the catalogue "in ground" column) for buried runs. They are the buried-cable
 * counterparts to the AIR ambient table (`AMBIENT_TEMP_FACTORS`): for
 * ABOVE-GROUND runs the existing air-temperature factor (`ambientFactor`) still
 * applies and these ground factors do NOT.
 *
 * Linear interpolation between tabulated points, clamped outside the range,
 * matching the `interpolateTable` approach used for the other correction tables.
 */
import { interpolateTable } from '../engine/util';

/**
 * Ground-temperature correction factors for PVC insulation, IEC 60364-5-52
 * Table B.52.15 (buried cables, ground reference temperature 20 °C). Cooler soil
 * than 20 °C buys capacity (>1); warmer soil derates (<1).
 */
export const GROUND_TEMP_FACTORS: Readonly<Record<number, number>> = {
  10: 1.1,
  15: 1.05,
  20: 1.0,
  25: 0.95,
  30: 0.89,
  35: 0.84,
  40: 0.77,
  45: 0.71,
  50: 0.63,
};

/**
 * Ground-temperature correction factors for XLPE insulation, IEC 60364-5-52
 * Table B.52.15 (buried cables, ground reference 20 °C). XLPE's larger headroom
 * to its limit temperature derates more gently than PVC.
 */
export const GROUND_TEMP_FACTORS_XLPE: Readonly<Record<number, number>> = {
  10: 1.07,
  15: 1.04,
  20: 1.0,
  25: 0.96,
  30: 0.93,
  35: 0.89,
  40: 0.85,
  45: 0.8,
  50: 0.76,
};

/**
 * Depth-of-laying correction factors (depth in metres) for cables in ducts /
 * direct-buried, IEC 60364-5-52. The reference depth is 0.5 m (factor 1.0);
 * deeper burial reduces heat dissipation and so derates the ampacity slightly.
 */
export const DEPTH_OF_LAYING_FACTORS: Readonly<Record<number, number>> = {
  0.5: 1.0,
  0.6: 0.98,
  0.8: 0.96,
  1.0: 0.95,
  1.25: 0.94,
  1.5: 0.93,
  1.75: 0.93,
  2.0: 0.92,
};

/**
 * Ground-temperature correction factor (interpolated, clamped outside range) for
 * a buried cable at `groundTempC`, per insulation family. IEC 60364-5-52
 * Table B.52.15 (reference 20 °C). Used INSTEAD of the air ambient factor for
 * buried runs.
 */
export function groundTempFactor(groundTempC: number, insulation: 'PVC' | 'XLPE'): number {
  const table = insulation === 'XLPE' ? GROUND_TEMP_FACTORS_XLPE : GROUND_TEMP_FACTORS;
  return interpolateTable(table, groundTempC);
}

/**
 * Depth-of-laying correction factor (interpolated, clamped outside range) for a
 * buried cable laid at `depthM` metres. IEC 60364-5-52 (reference depth 0.5 m).
 */
export function depthFactor(depthM: number): number {
  return interpolateTable(DEPTH_OF_LAYING_FACTORS, depthM);
}
