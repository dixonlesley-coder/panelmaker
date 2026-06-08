import {
  AMBIENT_TEMP_FACTORS,
  GROUPING_FACTORS,
  INSTALL_METHOD_FACTORS,
} from '../standards/conductors';
import type { InstallMethod } from '../types/electrical';
import { interpolateTable } from './util';

/** Ambient temperature correction factor (interpolated). */
export function ambientFactor(tempC: number): number {
  return interpolateTable(AMBIENT_TEMP_FACTORS, tempC);
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

/** Installation-method multiplier on the reference KHA. */
export function methodFactor(method: InstallMethod): number {
  return INSTALL_METHOD_FACTORS[method] ?? 1;
}

export interface DeratingInput {
  ambientC: number;
  groupingCount: number;
  installMethod: InstallMethod;
}

/** Combined derating factor = ambient x grouping x method. */
export function deratingFactor({ ambientC, groupingCount, installMethod }: DeratingInput): number {
  return ambientFactor(ambientC) * groupingFactor(groupingCount) * methodFactor(installMethod);
}
