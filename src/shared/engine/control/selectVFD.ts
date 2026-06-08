import {
  VFD_RATINGS_400V,
  VFD_CURRENT_MARGIN,
  vfdHeatLossW,
  type DriveTorqueType,
} from '../../standards/control/vfd';
import { round } from '../util';

export interface VfdSelectInput {
  flcA: number;
  torqueType?: DriveTorqueType;
}

export interface VfdSelection {
  ratedKw: number;
  outputA: number;
  heatLossW: number;
  requiredA: number;
  ok: boolean;
}

/**
 * Select a VFD by rated output current (>= motor FLC x margin). Constant-torque
 * duty bumps up one frame for thermal headroom at low speed.
 */
export function selectVFD({ flcA, torqueType = 'variable' }: VfdSelectInput): VfdSelection {
  const requiredA = flcA * VFD_CURRENT_MARGIN;
  let idx = VFD_RATINGS_400V.findIndex((v) => v.outputA >= requiredA);
  if (idx === -1) {
    idx = VFD_RATINGS_400V.length - 1;
  } else if (torqueType === 'constant' && idx < VFD_RATINGS_400V.length - 1) {
    idx += 1;
  }
  const v = VFD_RATINGS_400V[idx]!;
  return {
    ratedKw: v.kw,
    outputA: v.outputA,
    heatLossW: round(vfdHeatLossW(v.kw), 0),
    requiredA: round(requiredA, 1),
    ok: v.outputA >= requiredA,
  };
}
