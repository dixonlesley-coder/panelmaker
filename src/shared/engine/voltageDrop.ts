import { conductorResistanceOhmPerKm, CONDUCTOR_X_OHM_PER_KM } from '../standards/conductors';
import type { ConductorMaterial, SystemType } from '../types/electrical';
import type { VoltageDropResult } from '../types/results';
import { round } from './util';

export interface VoltageDropInput {
  currentA: number;
  lengthM: number;
  csaMm2: number;
  cosPhi: number;
  system: SystemType;
  voltageV: number;
  isLighting: boolean;
  /** Conductor material (default Cu) — aluminum has ~1.6× the resistance. */
  material?: ConductorMaterial;
}

/**
 * Voltage drop over a cable run.
 *   single-phase: dV = 2  * I * L * (R*cosphi + X*sinphi)
 *   three-phase:  dV = sqrt(3) * I * L * (R*cosphi + X*sinphi)
 * Limit: 5% general, 3% lighting (SNI IEC 60364-5-52).
 */
export function voltageDrop(input: VoltageDropInput): VoltageDropResult {
  const { currentA, lengthM, csaMm2, cosPhi, system, voltageV, isLighting } = input;
  const rPerM = conductorResistanceOhmPerKm(csaMm2, input.material ?? 'Cu') / 1000;
  const xPerM = CONDUCTOR_X_OHM_PER_KM / 1000;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const factor = system === '3ph' ? Math.sqrt(3) : 2;

  const dropV = factor * currentA * lengthM * (rPerM * cosPhi + xPerM * sinPhi);
  const dropPercent = voltageV > 0 ? (dropV / voltageV) * 100 : 0;
  const limitPercent = isLighting ? 3 : 5;

  return {
    dropV: round(dropV, 2),
    dropPercent: round(dropPercent, 2),
    limitPercent,
    withinLimit: dropPercent <= limitPercent + 1e-9,
  };
}
