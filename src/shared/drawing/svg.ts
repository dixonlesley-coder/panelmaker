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
import { panelLabel } from '../labels';
import {
  GUTTER_MM,
  drawingBounds,
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
export function n(v: number): string {
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
      const fill = p.filled ? INK : 'none';
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`;
    }
    case 'text': {
      const size = Math.max(p.size, MIN_FONT);
      const anchor = p.anchor ?? 'start';
      const fill = p.dim ? DIM : INK;
      const weight = p.bold ? ' font-weight="600"' : '';
      const rot = p.rotate ? ` transform="rotate(${n(p.rotate)} ${n(p.x)} ${n(p.y)})"` : '';
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(size)}" text-anchor="${anchor}" fill="${fill}"${weight}${rot}>${escapeXml(p.text)}</text>`;
    }
  }
}

/**
 * A small drawing title-strip rendered bottom-right of an SVG drawing. Every
 * field is optional; the strip is omitted entirely when nothing is supplied so
 * existing callers are unaffected.
 */
export interface TitleStrip {
  /** Designing company / consultancy name. */
  company?: string;
  /** Project name (top line of the strip). */
  project?: string;
  /** Sheet / drawing title (e.g. "Single-line diagram"). */
  sheet?: string;
  /** Drawing number stamped in the strip. */
  drawingNumber?: string;
  /** Current revision label. */
  revision?: string;
}

/** True when at least one title-strip field carries content. */
function hasTitleStrip(t: TitleStrip): boolean {
  return Boolean(t.company || t.project || t.sheet || t.drawingNumber || t.revision);
}

/**
 * Build the SVG primitives for a bottom-right title block, anchored to the
 * drawing's extents (mm coordinates). Returns an empty string when the strip has
 * no content. The box sits just inside the bottom-right corner of the drawing.
 */
function titleStripSvg(d: Drawing, t: TitleStrip): string {
  if (!hasTitleStrip(t)) return '';
  // Fixed-size strip in the same user units as the drawing.
  const w = Math.max(Math.min(d.width * 0.42, d.width), 150);
  const h = 64;
  const x = d.width - w;
  const y = d.height - h;
  const fs = Math.max(h / 7, MIN_FONT);
  const pad = fs * 0.7;
  const parts: string[] = [];
  // Outer frame + header divider.
  parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`);
  parts.push(`<line x1="${n(x)}" y1="${n(y + fs * 2)}" x2="${n(x + w)}" y2="${n(y + fs * 2)}" stroke="${INK}" stroke-width="0.75"/>`);
  // Header: company (or project) name.
  const header = t.company || t.project || '';
  if (header) {
    parts.push(
      `<text x="${n(x + pad)}" y="${n(y + fs * 1.4)}" font-size="${n(fs * 1.1)}" fill="${INK}">${escapeXml(header)}</text>`,
    );
  }
  // Body lines.
  let ly = y + fs * 3.2;
  const line = (label: string, value: string) => {
    parts.push(
      `<text x="${n(x + pad)}" y="${n(ly)}" font-size="${n(fs)}" fill="${DIM}">${escapeXml(label)}</text>` +
        `<text x="${n(x + w - pad)}" y="${n(ly)}" font-size="${n(fs)}" text-anchor="end" fill="${INK}">${escapeXml(value)}</text>`,
    );
    ly += fs * 1.4;
  };
  if (t.project && t.company) line('Project', t.project);
  if (t.sheet) line('Sheet', t.sheet);
  if (t.drawingNumber) line('Dwg', t.drawingNumber);
  if (t.revision) line('Rev', t.revision);
  return parts.join('');
}

/**
 * Wrap a {@link Drawing} into a self-contained `<svg>` document string. A small
 * margin is added around the extents so edge labels are not clipped, and the
 * viewBox carries the real mm coordinates (callers fit the SVG to a box).
 *
 * When a {@link TitleStrip} with content is supplied, a small title block is
 * drawn at the bottom-right of the drawing. Omitting it (the default) leaves the
 * output byte-for-byte identical to before, so existing callers/tests are
 * unaffected.
 */
export function drawingToSvg(d: Drawing, title: string, titleStrip?: TitleStrip): string {
  // Frame the TRUE content bounds (text + any negative-coordinate dimension
  // geometry) so nothing clips, then add a small uniform margin.
  const b = drawingBounds(d);
  const m = 8;
  const minX = Math.min(b.minX, 0) - m;
  const minY = Math.min(b.minY, 0) - m;
  const maxX = Math.max(b.maxX, d.width) + m;
  const maxY = Math.max(b.maxY, d.height) + m;
  const vbW = maxX - minX;
  const vbH = maxY - minY;
  const body = d.prims.map(primToSvg).join('');
  const strip = titleStrip ? titleStripSvg(d, titleStrip) : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(vbW)}" height="${n(vbH)}" ` +
    `viewBox="${n(minX)} ${n(minY)} ${n(vbW)} ${n(vbH)}" ` +
    `font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${escapeXml(title)}">` +
    body +
    strip +
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

  // Placed branch devices (to-scale footprints). The cross-reference tag is
  // drawn VERTICALLY inside the device so even a 1-module breaker stays legible
  // and adjacent devices never overlap; the full name lives in the schedule.
  const tagSize = 9;
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
      y: pl.y + pl.h / 2,
      text: pl.device.tag,
      size: tagSize,
      anchor: 'middle',
      rotate: -90,
      bold: true,
    });
  }

  // Busbar chamber.
  const ch = lay.chamber;
  prims.push({ type: 'rect', x: ch.x, y: ch.y, w: ch.w, h: ch.h, weight: 1, dashed: true, accent: true });
  prims.push({
    type: 'text',
    x: ch.x + ch.w / 2,
    y: ch.y + ch.h / 2,
    text: 'BUSBAR CHAMBER',
    size: 9,
    anchor: 'middle',
    dim: true,
  });

  // Overall dimension lines (witness lines + ticks + text), offset clear of the
  // cabinet. The height dimension text is rotated to read up the left edge.
  const off = 26;
  // Width (top).
  prims.push({ type: 'line', x1: 0, y1: -off, x2: widthMm, y2: -off, weight: 0.6 });
  prims.push({ type: 'line', x1: 0, y1: -off - 4, x2: 0, y2: -off + 4, weight: 0.6 });
  prims.push({ type: 'line', x1: widthMm, y1: -off - 4, x2: widthMm, y2: -off + 4, weight: 0.6 });
  prims.push({ type: 'text', x: widthMm / 2, y: -off - 3, text: `${enc.widthMm} mm`, size: 9, anchor: 'middle', dim: true });
  // Height (left).
  prims.push({ type: 'line', x1: -off, y1: 0, x2: -off, y2: heightMm, weight: 0.6 });
  prims.push({ type: 'line', x1: -off - 4, y1: 0, x2: -off + 4, y2: 0, weight: 0.6 });
  prims.push({ type: 'line', x1: -off - 4, y1: heightMm, x2: -off + 4, y2: heightMm, weight: 0.6 });
  prims.push({ type: 'text', x: -off - 3, y: heightMm / 2, text: `${enc.heightMm} mm`, size: 9, anchor: 'middle', dim: true, rotate: -90 });

  return { width: widthMm, height: heightMm, prims };
}

/**
 * A to-scale general-arrangement FRONT VIEW of the panel as a standalone SVG
 * string: enclosure outline, DIN rails and each branch breaker laid onto the
 * rails as a to-scale rectangle (width = poles × DIN module + control gear),
 * filling left-to-right and wrapping to the next rail.
 */
export function panelGaSvg(panel: PanelInput, result: PanelResult, titleStrip?: TitleStrip): string {
  return drawingToSvg(gaDrawing(panel, result), `${panelLabel(panel)} general arrangement`, titleStrip);
}

/* -------------------------------- SLD view -------------------------------- */

/**
 * A single-line diagram of the panel as a standalone SVG string: incomer breaker
 * → busbar → each branch breaker → load, with labels (breaker rating/curve,
 * cable spec, load name). A clean vertical-bus schematic.
 */
export function panelSldSvg(panel: PanelInput, result: PanelResult, titleStrip?: TitleStrip): string {
  return drawingToSvg(layoutSld(panel, result), `${panelLabel(panel)} single-line diagram`, titleStrip);
}
