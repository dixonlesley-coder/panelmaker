/**
 * Minimal AutoCAD R12 ASCII DXF writer. Pure string templating — no DOM, no Node.
 * It serialises the same shared {@link Drawing} primitives the SVG builder uses,
 * so the exported `.dxf` matches the screen / PDF geometry. R12 is the most widely
 * importable DXF flavour and needs no TABLES/handles — just an ENTITIES section.
 *
 * The screen geometry is Y-DOWN (origin top-left); CAD is conventionally Y-UP, so
 * every Y is flipped to `height - y`. A DXF group is a code line followed by a
 * value line; entities live between `SECTION/ENTITIES` and `ENDSEC`, closed by
 * `EOF`.
 */

import type { PanelInput } from '../types/project';
import type { PanelResult } from '../types/results';
import type { Drawing, Prim } from './geometry';
import { gaDrawing } from './svg';
import { layoutSld } from './sld';

/** Emit a single `code\nvalue` DXF group. */
function group(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/** Default layer all entities are placed on. */
const LAYER = 'PANELMAKER';

/** A LINE entity between two points (Y already flipped). */
function dxfLine(x1: number, y1: number, x2: number, y2: number): string {
  return (
    group(0, 'LINE') +
    group(8, LAYER) +
    group(10, x1) +
    group(20, y1) +
    group(11, x2) +
    group(21, y2)
  );
}

/** A CIRCLE entity (Y already flipped). */
function dxfCircle(cx: number, cy: number, r: number): string {
  return group(0, 'CIRCLE') + group(8, LAYER) + group(10, cx) + group(20, cy) + group(40, r);
}

/**
 * A TEXT entity. Group 72 (0=left,1=centre,2=right) sets the horizontal anchor;
 * when not left-aligned the alignment point goes in group 11/21 too.
 */
function dxfText(
  x: number,
  y: number,
  height: number,
  text: string,
  anchor: 'start' | 'middle' | 'end',
  rotateCw = 0,
): string {
  const justify = anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0;
  // DXF has no escaping; strip control/newline characters defensively.
  const clean = text.replace(/[\r\n]+/g, ' ');
  let out = group(0, 'TEXT') + group(8, LAYER) + group(10, x) + group(20, y) + group(40, height);
  out += group(1, clean);
  // DXF rotation (group 50) is CCW degrees; the model's rotate is CW (SVG sense).
  if (rotateCw) out += group(50, -rotateCw);
  if (justify !== 0) {
    out += group(72, justify) + group(11, x) + group(21, y);
  }
  return out;
}

/** Serialise one primitive into DXF entities (Y flipped about `h`). */
function primToDxf(p: Prim, h: number): string {
  const fy = (y: number) => h - y;
  switch (p.type) {
    case 'line':
      return dxfLine(p.x1, fy(p.y1), p.x2, fy(p.y2));
    case 'rect': {
      // Four LINEs forming the rectangle outline.
      const x2 = p.x + p.w;
      const yTop = fy(p.y);
      const yBot = fy(p.y + p.h);
      return (
        dxfLine(p.x, yTop, x2, yTop) +
        dxfLine(x2, yTop, x2, yBot) +
        dxfLine(x2, yBot, p.x, yBot) +
        dxfLine(p.x, yBot, p.x, yTop)
      );
    }
    case 'circle':
      return dxfCircle(p.cx, fy(p.cy), p.r);
    case 'text':
      // SVG text y is the glyph baseline; DXF TEXT y is the bottom of the glyph
      // box. Dropping the alignment point by ~20% of the cap height places the
      // baseline at a comparable position after the Y-flip.
      return dxfText(p.x, fy(p.y) - p.size * 0.2, p.size, p.text, p.anchor ?? 'start', p.rotate ?? 0);
  }
}

/** Wrap a {@link Drawing} as a complete R12 DXF document. */
export function drawingToDxf(d: Drawing): string {
  const entities = d.prims.map((p) => primToDxf(p, d.height)).join('');
  return (
    group(0, 'SECTION') +
    group(2, 'ENTITIES') +
    entities +
    group(0, 'ENDSEC') +
    group(0, 'EOF')
  );
}

/** General-arrangement front view of a panel as an R12 DXF document. */
export function panelGaDxf(panel: PanelInput, result: PanelResult): string {
  return drawingToDxf(gaDrawing(panel, result));
}

/** Single-line diagram of a panel as an R12 DXF document. */
export function panelSldDxf(panel: PanelInput, result: PanelResult): string {
  return drawingToDxf(layoutSld(panel, result));
}
