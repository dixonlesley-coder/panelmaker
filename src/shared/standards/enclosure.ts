/**
 * Enclosure sizing reference data and rules of thumb.
 *   - DIN-rail module geometry for counting device width.
 *   - Sheet-metal gauge vs panel size.
 *   - Ventilation method vs internal heat dissipation.
 *   - Default load diversity factor for feeder aggregation.
 */

/** Width of one DIN module / breaker pole (mm). A 3-pole device = 3 modules. */
export const DIN_MODULE_WIDTH_MM = 18;

/** Vertical pitch between DIN-rail rows including wiring gutter (mm). */
export const DIN_ROW_PITCH_MM = 150;

/** Usable modules per DIN row before a new row is started. */
export const MODULES_PER_ROW = 24;

/** Top/bottom margin for glands, bending space and clearances (mm). */
export const ENCLOSURE_VERTICAL_MARGIN_MM = 200;

/** Side margin plus busbar chamber + wiring gutter allowance (mm). */
export const ENCLOSURE_SIDE_MARGIN_MM = 150;

/** Default enclosure depth for wall-mount panels (mm). */
export const ENCLOSURE_DEPTH_WALL_MM = 200;

/** Default enclosure depth when VFD / floor-standing gear is present (mm). */
export const ENCLOSURE_DEPTH_FLOOR_MM = 400;

/** Sheet-metal body thickness (mm) as a function of the largest panel dimension. */
export function sheetThicknessMm(largestDimensionMm: number): number {
  if (largestDimensionMm <= 600) return 1.2;
  if (largestDimensionMm <= 1000) return 1.5;
  if (largestDimensionMm <= 1600) return 2.0;
  return 2.5;
}

export type Ventilation = 'natural' | 'fan-filter' | 'forced' | 'heat-exchanger';

/** Cooling method recommended for a given internal heat dissipation (W). */
export function ventilationFor(totalHeatW: number): Ventilation {
  if (totalHeatW < 50) return 'natural';
  if (totalHeatW < 200) return 'fan-filter';
  if (totalHeatW < 500) return 'forced';
  return 'heat-exchanger';
}

/**
 * Default diversity (demand) factor applied when aggregating downstream loads
 * onto a feeder. This is a *design input*, not a fixed standard value — it is
 * configurable per panel; this is only the default seed.
 */
export const DEFAULT_DIVERSITY_FACTOR = 0.8;
