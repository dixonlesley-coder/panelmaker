import {
  AMBIENT_TEMP_FACTORS,
  AMBIENT_TEMP_FACTORS_XLPE,
  GROUPING_FACTORS,
  SOIL_THERMAL_RESISTIVITY_FACTORS,
} from '../standards/conductors';
import type { InstallMethod, Insulation } from '../types/electrical';
import { interpolateTable } from './util';

/** Ambient temperature correction factor (interpolated), per insulation family. */
export function ambientFactor(tempC: number, insulation: Insulation = 'PVC'): number {
  const table = insulation === 'XLPE' ? AMBIENT_TEMP_FACTORS_XLPE : AMBIENT_TEMP_FACTORS;
  return interpolateTable(table, tempC);
}

/** Grouping (bunching) correction factor for `count` grouped circuits. */
export function groupingFactor(count: number): number {
  const n = Math.max(1, Math.floor(count));
  const keys = Object.keys(GROUPING_FACTORS)
    .map(Number)
    .sort((a, b) => a - b);
  const last = keys[keys.length - 1]!;
  if (n >= last) return GROUPING_FACTORS[last]!;
  return GROUPING_FACTORS[n] ?? 1;
}

/**
 * Soil thermal-resistivity correction — applies to BURIED runs only (IEC
 * 60364-5-52 B.52.16). Other methods dissipate to air, so the soil is irrelevant.
 */
export function soilThermalFactor(
  method: InstallMethod,
  soilThermalResistivityKmW: number | undefined,
): number {
  if (method !== 'buried' || soilThermalResistivityKmW === undefined) return 1;
  return interpolateTable(SOIL_THERMAL_RESISTIVITY_FACTORS, soilThermalResistivityKmW);
}

export interface DeratingInput {
  ambientC: number;
  groupingCount: number;
  installMethod: InstallMethod;
  /** Insulation family — XLPE derates more gently with ambient. */
  insulation?: Insulation;
  /** Site soil thermal resistivity (K·m/W); only affects buried runs. */
  soilThermalResistivityKmW?: number;
}

/**
 * Combined derating factor = ambient × grouping × soil (buried only). The
 * installation method itself is no longer a multiplier — `khaFor` selects the
 * per-method IEC ampacity table instead, since the method changes the SHAPE of
 * the ampacity curve, not just its level.
 */
export function deratingFactor({
  ambientC,
  groupingCount,
  installMethod,
  insulation,
  soilThermalResistivityKmW,
}: DeratingInput): number {
  return (
    ambientFactor(ambientC, insulation ?? 'PVC') *
    groupingFactor(groupingCount) *
    soilThermalFactor(installMethod, soilThermalResistivityKmW)
  );
}
