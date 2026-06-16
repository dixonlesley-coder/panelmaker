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
  /** Manual override of any dimension / row count (to suit the room); else auto. */
  override?: { widthMm?: number; heightMm?: number; depthMm?: number; rows?: number };
}

/** Usable DIN modules across one row for a given enclosure width. */
function usableModulesPerRow(widthMm: number): number {
  return Math.max(1, Math.floor((widthMm - 2 * ENCLOSURE_SIDE_MARGIN_MM) / DIN_MODULE_WIDTH_MM));
}

/** Estimate enclosure W x H x D, sheet thickness and ventilation method. */
export function estimateEnclosure({
  modules,
  totalHeatW,
  hasFloorGear = false,
  override = {},
}: EnclosureInput): EnclosureResult {
  const safeModules = Math.max(1, Math.ceil(modules));

  // Rows: explicit wins; else derive from a manual width (more rows when narrow);
  // else the standard "wrap past MODULES_PER_ROW" rule.
  const rows =
    override.rows && override.rows > 0
      ? Math.max(1, Math.ceil(override.rows))
      : override.widthMm
        ? Math.max(1, Math.ceil(safeModules / usableModulesPerRow(override.widthMm)))
        : Math.max(1, Math.ceil(safeModules / MODULES_PER_ROW));

  // Distribute the gear evenly across however many rows we have.
  const modulesPerRow = Math.min(Math.ceil(safeModules / rows), MODULES_PER_ROW);
  const autoWidth = roundUp(modulesPerRow * DIN_MODULE_WIDTH_MM + 2 * ENCLOSURE_SIDE_MARGIN_MM, 50);
  const autoHeight = roundUp(rows * DIN_ROW_PITCH_MM + ENCLOSURE_VERTICAL_MARGIN_MM, 50);

  const widthMm = Math.max(override.widthMm ?? autoWidth, 2 * ENCLOSURE_SIDE_MARGIN_MM + DIN_MODULE_WIDTH_MM);
  const heightMm = Math.max(override.heightMm ?? autoHeight, DIN_ROW_PITCH_MM + 50);
  const depthMm = override.depthMm ?? (hasFloorGear ? ENCLOSURE_DEPTH_FLOOR_MM : ENCLOSURE_DEPTH_WALL_MM);
  const largest = Math.max(widthMm, heightMm, depthMm);

  // Does the gear actually fit the (possibly manual) box? rows × modules/row.
  const fitsModules = rows * usableModulesPerRow(widthMm) >= safeModules;

  return {
    widthMm,
    heightMm,
    depthMm,
    sheetThicknessMm: sheetThicknessMm(largest),
    totalHeatW: round(totalHeatW, 1),
    ventilation: ventilationFor(totalHeatW),
    modules: safeModules,
    rows,
    manual: Object.keys(override).length > 0,
    fitsModules,
  };
}
