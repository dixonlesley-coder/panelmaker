/**
 * Pure SVG-string builders for the panel general-arrangement (GA) front view and
 * the single-line diagram (SLD). No DOM, no Node — just string templating over
 * the shared {@link Drawing} primitive model in `./geometry`, so the on-screen
 * view, the PDF embed and the exported `.svg` file all share one geometry.
 *
 * Output constraints (pdfmake renders SVG via svg-to-pdfkit): only `<svg>` with
 * an explicit width/height + viewBox and the basic elements
 * `rect line circle path text g polyline`, styled with ATTRIBUTES only — no CSS
 * classes, no `foreignObject`, no external fonts/filters. Text size stays >= 6.
 */

import type { PanelInput } from '../types/project';
import type { PanelResult } from '../types/results';
import {
  GUTTER_MM,
  layoutGa,
  type Drawing,
  type Prim,
} from './geometry';
import { layoutSld } from './sld';

/** Structural outline / line colour. */
const INK = '#334155';
/** Accent (device / bus) colour. */
const ACCENT = '#2563eb';
/** Dimension / annotation colour. */
const DIM = '#64748b';
/** Minimum legible font size (SVG user units). */
const MIN_FONT = 6;

/** Escape the five XML-significant characters in text content / attributes. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Round to 2 dp and drop a trailing `.00` so the markup stays compact. */
function n(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
}

/** Render one primitive to an SVG element string. */
function primToSvg(p: Prim): string {
  switch (p.type) {
    case 'line': {
      const w = p.weight ?? 1;
      const dash = p.dashed ? ' stroke-dasharray="6 4"' : '';
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${INK}" stroke-width="${n(w)}"${dash}/>`;
    }
    case 'rect': {
      const w = p.weight ?? 1;
      const stroke = p.accent ? ACCENT : INK;
      const dash = p.dashed ? ' stroke-dasharray="6 4"' : '';
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="none" stroke="${stroke}" stroke-width="${n(w)}"${dash}/>`;
    }
    case 'circle': {
      const w = p.weight ?? 1;
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="none" stroke="${INK}" stroke-width="${n(w)}"/>`;
    }
    case 'text': {
      const size = Math.max(p.size, MIN_FONT);
      const anchor = p.anchor ?? 'start';
      const fill = p.dim ? DIM : INK;
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(size)}" text-anchor="${anchor}" fill="${fill}">${escapeXml(p.text)}</text>`;
    }
  }
}

/**
 * Wrap a {@link Drawing} into a self-contained `<svg>` document string. A small
 * margin is added around the extents so edge labels are not clipped, and the
 * viewBox carries the real mm coordinates (callers fit the SVG to a box).
 */
export function drawingToSvg(d: Drawing, title: string): string {
  const m = 24; // mm margin around the drawing for outer dimension labels
  const vbW = d.width + 2 * m;
  const vbH = d.height + 2 * m;
  const body = d.prims.map(primToSvg).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(vbW)}" height="${n(vbH)}" ` +
    `viewBox="${n(-m)} ${n(-m)} ${n(vbW)} ${n(vbH)}" ` +
    `font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${escapeXml(title)}">` +
    body +
    `</svg>`
  );
}

/* ------------------------------ GA front view ----------------------------- */

/**
 * Build the {@link Drawing} for the to-scale GA front elevation: cabinet outline,
 * door gutter, DIN rails, the busbar chamber, the placed branch devices and the
 * overall dimension labels. Shared by the SVG builder and (via primitives) the
 * DXF writer.
 */
export function gaDrawing(panel: PanelInput, result: PanelResult): Drawing {
  const lay = layoutGa(panel, result);
  const { widthMm, heightMm, innerW } = lay;
  const enc = result.enclosure;
  const prims: Prim[] = [];

  // Cabinet body.
  prims.push({
    type: 'rect',
    x: 0,
    y: 0,
    w: widthMm,
    h: heightMm,
    weight: Math.max(enc.sheetThicknessMm, 1.5),
  });
  // Door gutter / mounting-plate margin.
  prims.push({
    type: 'rect',
    x: GUTTER_MM / 2,
    y: GUTTER_MM / 2,
    w: widthMm - GUTTER_MM,
    h: heightMm - GUTTER_MM,
    weight: 0.75,
    dashed: true,
  });

  // DIN rails.
  for (const y of lay.railYs) {
    prims.push({ type: 'line', x1: GUTTER_MM, y1: y, x2: GUTTER_MM + innerW, y2: y, weight: 2 });
  }

  // Placed branch devices (to-scale footprints) with labels.
  const labelSize = Math.max(widthMm / 60, MIN_FONT);
  for (const pl of lay.placements) {
    prims.push({
      type: 'rect',
      x: pl.x + 1,
      y: pl.y,
      w: pl.w - 2,
      h: pl.h,
      weight: 1,
      accent: true,
    });
    prims.push({
      type: 'text',
      x: pl.x + pl.w / 2,
      y: pl.y + pl.h / 2 + labelSize / 3,
      text: pl.device.label,
      size: labelSize,
      anchor: 'middle',
    });
  }

  // Busbar chamber.
  const ch = lay.chamber;
  prims.push({ type: 'rect', x: ch.x, y: ch.y, w: ch.w, h: ch.h, weight: 1, dashed: true, accent: true });
  prims.push({
    type: 'text',
    x: ch.x + ch.w / 2,
    y: ch.y + ch.h / 2,
    text: 'busbar chamber',
    size: Math.max(widthMm / 36, MIN_FONT),
    anchor: 'middle',
    dim: true,
  });

  // Overall dimension labels.
  const dimSize = Math.max(widthMm / 32, MIN_FONT);
  prims.push({ type: 'text', x: widthMm / 2, y: -8, text: `${enc.widthMm} mm`, size: dimSize, anchor: 'middle', dim: true });
  prims.push({ type: 'text', x: -8, y: heightMm / 2, text: `${enc.heightMm} mm`, size: dimSize, anchor: 'middle', dim: true });

  return { width: widthMm, height: heightMm, prims };
}

/**
 * A to-scale general-arrangement FRONT VIEW of the panel as a standalone SVG
 * string: enclosure outline, DIN rails and each branch breaker laid onto the
 * rails as a to-scale rectangle (width = poles × DIN module + control gear),
 * filling left-to-right and wrapping to the next rail.
 */
export function panelGaSvg(panel: PanelInput, result: PanelResult): string {
  return drawingToSvg(gaDrawing(panel, result), `${panel.name} general arrangement`);
}

/* -------------------------------- SLD view -------------------------------- */

/**
 * A single-line diagram of the panel as a standalone SVG string: incomer breaker
 * → busbar → each branch breaker → load, with labels (breaker rating/curve,
 * cable spec, load name). A clean vertical-bus schematic.
 */
export function panelSldSvg(panel: PanelInput, result: PanelResult): string {
  return drawingToSvg(layoutSld(panel, result), `${panel.name} single-line diagram`);
}
