/**
 * Control-circuit auxiliary reference data: control transformer VA ladder, coil
 * burden figures, control-fuse sizing and standard control voltages.
 * (IEC 60947-4-1 Annex C / common practice.)
 */

/** Standard single-phase control transformer ratings (VA). */
export const CONTROL_TRANSFORMER_VA = [25, 50, 75, 100, 150, 250, 500, 750, 1000] as const;

/** Margin applied to the computed VA demand before choosing a transformer. */
export const CONTROL_TRANSFORMER_MARGIN = 1.2;

export interface CoilBurden {
  /** Steady-state (sealed) burden, VA. */
  sealedVA: number;
  /** Peak inrush burden at pickup, VA. */
  inrushVA: number;
}

/** Approximate coil burden by contactor AC-3 frame (230 VAC coil). */
export function coilBurdenForFrame(ac3A: number): CoilBurden {
  if (ac3A <= 12) return { sealedVA: 4, inrushVA: 20 };
  if (ac3A <= 40) return { sealedVA: 7, inrushVA: 40 };
  if (ac3A <= 115) return { sealedVA: 10, inrushVA: 65 };
  return { sealedVA: 16, inrushVA: 110 };
}

/** Typical small-device sealed burden (pilot lamp, timer, control relay), VA. */
export const PILOT_DEVICE_SEALED_VA = 5;

export type ControlVoltage = '24VDC' | '110VAC' | '230VAC' | '400VAC';

/** Default control voltage (Indonesian practice). */
export const DEFAULT_CONTROL_VOLTAGE: ControlVoltage = '230VAC';

/** Standard control-fuse / control-MCB ratings (A). */
export const CONTROL_FUSE_RATINGS_A = [0.5, 1, 1.6, 2, 4, 6, 10, 16] as const;

/** Secondary-side control-circuit protection sizing factor on full-load current. */
export const CONTROL_FUSE_SECONDARY_FACTOR = 2.0;
