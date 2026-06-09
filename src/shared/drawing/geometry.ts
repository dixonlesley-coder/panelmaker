/**
 * Pure drawing geometry shared by the SVG and DXF builders. No DOM, no Node —
 * just plain data describing where to put lines, rectangles and text so the two
 * renderers (vector SVG for screen/PDF, ASCII DXF for CAD) stay in lock-step and
 * there is a single source of truth for the panel general-arrangement and
 * single-line layouts.
 *
 * All coordinates are in millimetres in a Y-DOWN screen space (origin top-left).
 * The DXF writer flips Y so CAD sees a conventional Y-UP drawing.
 */

import { DIN_MODULE_WIDTH_MM } from '../standards/enclosure';
import type { PanelInput } from '../types/project';
import type { CircuitResult, PanelResult } from '../types/results';

/** Inner door gutter / mounting-plate margin around the chassis (mm). */
export const GUTTER_MM = 40;
/** Height reserved for the busbar chamber at the bottom of the GA view (mm). */
export const BUSBAR_CHAMBER_MM = 90;

/** A primitive line segment. */
export interface LinePrim {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke weight hint (mm); the SVG layer maps this to stroke-width. */
  weight?: number;
  /** Dashed outline hint. */
  dashed?: boolean;
}

/** A primitive rectangle (emitted as four LINEs in DXF). */
export interface RectPrim {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  weight?: number;
  dashed?: boolean;
  /** Accent (device / bus) vs. structural outline. */
  accent?: boolean;
}

/** A primitive circle (connection dot / terminal). */
export interface CirclePrim {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  weight?: number;
}

/** A primitive text label. */
export interface TextPrim {
  type: 'text';
  x: number;
  y: number;
  text: string;
  /** Font size (mm / SVG user units). */
  size: number;
  anchor?: 'start' | 'middle' | 'end';
  /** Subdued (dimension / annotation) vs. primary label. */
  dim?: boolean;
}

export type Prim = LinePrim | RectPrim | CirclePrim | TextPrim;

/** A drawing: a primitive list plus the overall extents (mm). */
export interface Drawing {
  width: number;
  height: number;
  prims: Prim[];
}

/** One branch device laid onto a DIN rail in the GA view. */
export interface DeviceFootprint {
  circuitId: string;
  /** Circuit name + breaker rating label. */
  label: string;
  /** DIN modules this device occupies (breaker poles + control gear). */
  modules: number;
  widthMm: number;
}

/**
 * Number of breaker poles for a circuit: 3-phase circuits get 3 poles, single-
 * phase 1. (The engine reports `'3ph'` on three-phase circuits.)
 */
function breakerPoles(c: CircuitResult): number {
  return c.phase === '3ph' ? 3 : 1;
}

/**
 * The to-scale device footprint for a branch circuit: the breaker poles plus any
 * control-gear module widths declared on the assembly devices, rounded up to a
 * whole number of DIN modules.
 */
export function deviceFootprint(c: CircuitResult): DeviceFootprint {
  let modules = breakerPoles(c);
  if (c.control) {
    for (const d of c.control.devices) {
      const qty = d.qty ?? 1;
      modules += ((d.widthMm ?? 0) / DIN_MODULE_WIDTH_MM) * qty;
    }
  }
  const whole = Math.max(1, Math.ceil(modules));
  return {
    circuitId: c.circuitId,
    label: `${c.name} · ${c.breaker.ratingA}A`,
    modules: whole,
    widthMm: whole * DIN_MODULE_WIDTH_MM,
  };
}

/** Branch circuits only (drop any incomer rows the engine may surface). */
export function branchDevices(result: PanelResult): DeviceFootprint[] {
  return result.circuits.map(deviceFootprint);
}

/**
 * Lay the device footprints onto the DIN rails left-to-right, wrapping to the
 * next rail when the current rail's usable width is exhausted. Returns the
 * placed rectangles in mm (Y-down) plus the rail geometry, so both the SVG and
 * DXF GA builders draw identical device positions.
 */
export interface GaLayout {
  widthMm: number;
  heightMm: number;
  innerW: number;
  /** Y of each DIN rail centre-line (mm). */
  railYs: number[];
  /** Busbar chamber band. */
  chamber: { x: number; y: number; w: number; h: number };
  placements: Array<{
    device: DeviceFootprint;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

/** Drawn height of a device block on the rail (mm). */
const DEVICE_BLOCK_H = 36;

export function layoutGa(panel: PanelInput, result: PanelResult): GaLayout {
  const enc = result.enclosure;
  const widthMm = Math.max(enc.widthMm, 2 * GUTTER_MM + DIN_MODULE_WIDTH_MM);
  const heightMm = Math.max(enc.heightMm, GUTTER_MM * 2 + BUSBAR_CHAMBER_MM + DEVICE_BLOCK_H);
  const rows = Math.max(1, enc.rows);

  const innerW = Math.max(widthMm - 2 * GUTTER_MM, DIN_MODULE_WIDTH_MM);
  const railTopY = GUTTER_MM + DEVICE_BLOCK_H;
  const railBottomY = heightMm - BUSBAR_CHAMBER_MM - GUTTER_MM;
  const railSpan = Math.max(railBottomY - railTopY, DIN_MODULE_WIDTH_MM);
  const railPitch = rows > 1 ? railSpan / (rows - 1) : 0;
  const railYs = Array.from({ length: rows }, (_, r) => railTopY + r * railPitch);

  const devices = branchDevices(result);
  const placements: GaLayout['placements'] = [];
  let rail = 0;
  let cursorX = GUTTER_MM;
  for (const device of devices) {
    // Wrap to the next rail when this device would overrun the usable width.
    if (cursorX + device.widthMm > GUTTER_MM + innerW + 0.001 && cursorX > GUTTER_MM) {
      rail += 1;
      cursorX = GUTTER_MM;
    }
    // Clamp to the last rail if we have more gear than rails (still drawn).
    const railIndex = Math.min(rail, rows - 1);
    const railY = railYs[railIndex] ?? railTopY;
    placements.push({
      device,
      x: cursorX,
      y: railY - DEVICE_BLOCK_H / 2,
      w: device.widthMm,
      h: DEVICE_BLOCK_H,
    });
    cursorX += device.widthMm;
  }

  const chamberY = heightMm - BUSBAR_CHAMBER_MM - GUTTER_MM / 2;
  const chamber = {
    x: GUTTER_MM / 2,
    y: chamberY,
    w: widthMm - GUTTER_MM,
    h: BUSBAR_CHAMBER_MM,
  };

  // Avoid an unused-binding lint while keeping the signature symmetric with the
  // SLD builder (the panel name is surfaced by the callers, not the layout).
  void panel;

  return { widthMm, heightMm, innerW, railYs, chamber, placements };
}
