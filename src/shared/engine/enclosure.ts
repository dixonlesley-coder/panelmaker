import {
  DIN_MODULE_WIDTH_MM,
  DIN_ROW_PITCH_MM,
  MODULES_PER_ROW,
  ENCLOSURE_VERTICAL_MARGIN_MM,
  ENCLOSURE_SIDE_MARGIN_MM,
  ENCLOSURE_DEPTH_WALL_MM,
  ENCLOSURE_DEPTH_FLOOR_MM,
  sheetThicknessMm,
  ventilationFor,
} from '../standards/enclosure';
import type { EnclosureResult } from '../types/results';
import { round, roundUp } from './util';

export interface EnclosureInput {
  /** Total DIN modules / pole-widths of mounted gear. */
  modules: number;
  /** Total internal heat dissipation (W). */
  totalHeatW: number;
  /** Floor-standing / VFD gear present -> deeper enclosure. */
  hasFloorGear?: boolean;
}

/** Estimate enclosure W x H x D, sheet thickness and ventilation method. */
export function estimateEnclosure({
  modules,
  totalHeatW,
  hasFloorGear = false,
}: EnclosureInput): EnclosureResult {
  const safeModules = Math.max(1, Math.ceil(modules));
  const rows = Math.max(1, Math.ceil(safeModules / MODULES_PER_ROW));
  const modulesPerRow = Math.min(safeModules, MODULES_PER_ROW);

  const widthMm = roundUp(modulesPerRow * DIN_MODULE_WIDTH_MM + 2 * ENCLOSURE_SIDE_MARGIN_MM, 50);
  const heightMm = roundUp(rows * DIN_ROW_PITCH_MM + ENCLOSURE_VERTICAL_MARGIN_MM, 50);
  const depthMm = hasFloorGear ? ENCLOSURE_DEPTH_FLOOR_MM : ENCLOSURE_DEPTH_WALL_MM;
  const largest = Math.max(widthMm, heightMm, depthMm);

  return {
    widthMm,
    heightMm,
    depthMm,
    sheetThicknessMm: sheetThicknessMm(largest),
    totalHeatW: round(totalHeatW, 1),
    ventilation: ventilationFor(totalHeatW),
    modules: safeModules,
    rows,
  };
}
