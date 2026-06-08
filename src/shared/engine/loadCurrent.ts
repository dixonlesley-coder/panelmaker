import type { SystemType } from '../types/electrical';

export interface LoadCurrentInput {
  powerW: number;
  voltageV: number;
  cosPhi: number;
  system: SystemType;
}

/**
 * Design current Ib from real power.
 *   single-phase: I = P / (V * cosphi)
 *   three-phase:  I = P / (sqrt(3) * V * cosphi)
 */
export function loadCurrent({ powerW, voltageV, cosPhi, system }: LoadCurrentInput): number {
  if (voltageV <= 0 || cosPhi <= 0) return 0;
  const denom = system === '3ph' ? Math.sqrt(3) * voltageV * cosPhi : voltageV * cosPhi;
  return powerW / denom;
}
