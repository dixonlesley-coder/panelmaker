/**
 * CAD-style "drawing sheet" presentation of a {@link Drawing}.
 *
 * Where {@link drawingToSvg} emits the bare diagram (used on-screen, where the
 * container scrolls/zooms), this module frames the same primitive geometry as a
 * finished plotted sheet for the PDF / `.svg` deliverable: a landscape A4 border
 * with zone reference markers, a multi-cell title block, an optional graphic
 * scale bar, and the diagram scaled to fill the drawing window.
 *
 * The key difference from a naïve fit-to-box is that **geometry is scaled but
 * text is held at a fixed paper size** (clamped to a legible band). A wide ten-
 * way single-line no longer shrinks its labels into illegibility when it is
 * fitted to the page — exactly how a real drawing is plotted to a scale while
 * its annotation stays at a readable height.
 *
 * Pure string templating: no DOM, no Node. Output obeys the same svg-to-pdfkit
 * constraints as `./svg` (attribute styling only; basic elements).
 */

import type { PanelInput } from '../types/project';
import type { PanelResult } from '../types/results';
import { panelLabel } from '../labels';
import { drawingBounds, type Drawing, type Prim } from './geometry';
import { pointsDrawing } from './points';
import { layoutSld } from './sld';
import { escapeXml, gaDrawing, n } from './svg';

/* ------------------------------- sheet metrics ---------------------------- */

/** Landscape A4 sheet (mm). */
const SHEET_W = 297;
const SHEET_H = 210;
/** Trim border inset and inner drawing-frame inset from the trim (mm). */
const TRIM = 5;
const FRAME = 10;
/** Title-block band reserved across the bottom of the drawing window (mm). */
const TITLE_H = 34;
/** Inner padding between the frame and the drawing window (mm). */
const PAD = 4;

/** Ink / accent / dim colours (kept in step with `./svg`). */
const INK = '#334155';
const ACCENT = '#2563eb';
const DIM = '#64748b';

/** Legible paper-text band (mm) — labels never plot smaller or larger than this. */
const MIN_TXT = 2.3;
const MAX_TXT = 3.6;
/** Minimum plotted stroke (mm) so scaled-down geometry stays visible. */
const MIN_SW = 0.22;
/** Cap on how far a small diagram is blown up to fill the window. */
const MAX_SCALE = 4;

/* ------------------------------- transform -------------------------------- */

interface Tx {
  s: number;
  ox: number;
  oy: number;
}

/** Map a model point through the fit transform. */
function tp(t: Tx, x: number, y: number): [number, number] {
  return [t.ox + x * t.s, t.oy + y * t.s];
}

/** Plotted (clamped) text size for a model size at the current scale. */
function txtSize(modelSize: number, s: number): number {
  return Math.min(Math.max(modelSize * s, MIN_TXT), MAX_TXT);
}

/** Emit one primitive through the transform, with paper-fixed text + min stroke. */
function primToSheet(p: Prim, t: Tx): string {
  switch (p.type) {
    case 'line': {
      const [x1, y1] = tp(t, p.x1, p.y1);
      const [x2, y2] = tp(t, p.x2, p.y2);
      const w = Math.max((p.weight ?? 1) * t.s, MIN_SW);
      const dash = p.dashed ? ' stroke-dasharray="2.2 1.6"' : '';
      return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${INK}" stroke-width="${n(w)}"${dash}/>`;
    }
    case 'rect': {
      const [x, y] = tp(t, p.x, p.y);
      const w = Math.max((p.weight ?? 1) * t.s, MIN_SW);
      const stroke = p.accent ? ACCENT : INK;
      const dash = p.dashed ? ' stroke-dasharray="2.2 1.6"' : '';
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(p.w * t.s)}" height="${n(p.h * t.s)}" fill="none" stroke="${stroke}" stroke-width="${n(w)}"${dash}/>`;
    }
    case 'circle': {
      const [cx, cy] = tp(t, p.cx, p.cy);
      const w = Math.max((p.weight ?? 1) * t.s, MIN_SW);
      const fill = p.filled ? INK : 'none';
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(p.r * t.s, 0.4))}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`;
    }
    case 'text': {
      const [x, y] = tp(t, p.x, p.y);
      const size = txtSize(p.size, t.s);
      const anchor = p.anchor ?? 'start';
      const fill = p.dim ? DIM : INK;
      const weight = p.bold ? ' font-weight="600"' : '';
      const rot = p.rotate ? ` transform="rotate(${n(p.rotate)} ${n(x)} ${n(y)})"` : '';
      return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="${anchor}" fill="${fill}"${weight}${rot}>${escapeXml(p.text)}</text>`;
    }
  }
}

/* ------------------------------ title block ------------------------------- */

/** Fields shown in the bottom-right title block of a drawing sheet. */
export interface SheetTitleBlock {
  company?: string;
  project?: string;
  client?: string;
  location?: string;
  sheet?: string;
  drawingNumber?: string;
  projectNumber?: string;
  revision?: string;
  engineer?: string;
  date?: string;
  /** Scale annotation (e.g. "1:5", "NTS"). */
  scale?: string;
  /** "Sheet n of m". */
  sheetNumber?: string;
}

/** Build the title-block SVG within a band at the sheet's bottom-right. */
function titleBlockSvg(tb: SheetTitleBlock, left: number, top: number, w: number, h: number): string {
  const parts: string[] = [];
  parts.push(`<rect x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" fill="#ffffff" stroke="${INK}" stroke-width="0.5"/>`);

  // Header band: company name.
  const headH = h * 0.26;
  parts.push(`<line x1="${n(left)}" y1="${n(top + headH)}" x2="${n(left + w)}" y2="${n(top + headH)}" stroke="${INK}" stroke-width="0.5"/>`);
  parts.push(
    `<text x="${n(left + 2.5)}" y="${n(top + headH * 0.68)}" font-size="${n(Math.min(headH * 0.62, 4.4))}" font-weight="700" fill="${INK}">${escapeXml(tb.company || 'PanelMaker')}</text>`,
  );

  // Sheet-title row below the header.
  const titleRowY = top + headH;
  const titleRowH = h * 0.2;
  parts.push(`<line x1="${n(left)}" y1="${n(titleRowY + titleRowH)}" x2="${n(left + w)}" y2="${n(titleRowY + titleRowH)}" stroke="${INK}" stroke-width="0.5"/>`);
  parts.push(
    `<text x="${n(left + 2.5)}" y="${n(titleRowY + titleRowH * 0.7)}" font-size="2.4" fill="${DIM}">DRAWING TITLE</text>`,
  );
  parts.push(
    `<text x="${n(left + w - 2.5)}" y="${n(titleRowY + titleRowH * 0.7)}" font-size="3.1" font-weight="600" text-anchor="end" fill="${INK}">${escapeXml(tb.sheet || '')}</text>`,
  );

  // Key/value grid (two columns) in the remaining body.
  const bodyY = titleRowY + titleRowH;
  const bodyH = h - headH - titleRowH;
  const rows: Array<[string, string, string, string]> = [
    ['Project', tb.project || '', 'Dwg no.', tb.drawingNumber || '—'],
    ['Client', tb.client || '—', 'Rev', tb.revision || '—'],
    ['Location', tb.location || '—', 'Scale', tb.scale || 'NTS'],
    ['Drawn', tb.engineer || '—', 'Date', tb.date || ''],
  ];
  const rowH = bodyH / rows.length;
  const colMid = left + w * 0.55;
  parts.push(`<line x1="${n(colMid)}" y1="${n(bodyY)}" x2="${n(colMid)}" y2="${n(top + h)}" stroke="${INK}" stroke-width="0.4"/>`);
  rows.forEach((r, i) => {
    const ry = bodyY + i * rowH;
    if (i > 0) parts.push(`<line x1="${n(left)}" y1="${n(ry)}" x2="${n(left + w)}" y2="${n(ry)}" stroke="${INK}" stroke-width="0.3"/>`);
    // Label and value share one baseline (label small/grey at the cell's left,
    // value to its right) so the two never collide in a short row.
    const baseY = ry + rowH * 0.68;
    parts.push(`<text x="${n(left + 2)}" y="${n(baseY)}" font-size="1.9" fill="${DIM}">${escapeXml(r[0].toUpperCase())}</text>`);
    parts.push(`<text x="${n(left + 17)}" y="${n(baseY)}" font-size="2.6" fill="${INK}">${escapeXml(r[1])}</text>`);
    parts.push(`<text x="${n(colMid + 2)}" y="${n(baseY)}" font-size="1.9" fill="${DIM}">${escapeXml(r[2].toUpperCase())}</text>`);
    parts.push(`<text x="${n(colMid + 16)}" y="${n(baseY)}" font-size="2.6" fill="${INK}">${escapeXml(r[3])}</text>`);
  });
  return parts.join('');
}

/* ------------------------------- scale bar -------------------------------- */

/**
 * A graphic scale bar (honest at any page fit, since it is plotted in the same
 * units as the geometry). `stepModel` is one tick in model units (mm for the GA);
 * we draw up to four ticks alternating fill.
 */
function scaleBarSvg(t: Tx, x: number, y: number, stepModel: number, unit: string): string {
  const stepPlot = stepModel * t.s;
  if (!(stepPlot > 0.5)) return '';
  const ticks = 4;
  const barH = 1.6;
  const parts: string[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const fill = i % 2 === 0 ? INK : '#ffffff';
    parts.push(`<rect x="${n(x + i * stepPlot)}" y="${n(y)}" width="${n(stepPlot)}" height="${n(barH)}" fill="${fill}" stroke="${INK}" stroke-width="0.25"/>`);
    parts.push(`<text x="${n(x + i * stepPlot)}" y="${n(y - 0.8)}" font-size="2.1" text-anchor="middle" fill="${DIM}">${i * stepModel}</text>`);
  }
  parts.push(`<text x="${n(x + ticks * stepPlot)}" y="${n(y - 0.8)}" font-size="2.1" text-anchor="middle" fill="${DIM}">${ticks * stepModel} ${unit}</text>`);
  return parts.join('');
}

/* --------------------------------- frame ---------------------------------- */

/** Trim + drawing frame with A/B/C row and 1/2/3 column zone markers. */
function frameSvg(): string {
  const parts: string[] = [];
  // Trim line.
  parts.push(`<rect x="${n(TRIM)}" y="${n(TRIM)}" width="${n(SHEET_W - 2 * TRIM)}" height="${n(SHEET_H - 2 * TRIM)}" fill="none" stroke="${INK}" stroke-width="0.35"/>`);
  // Drawing frame.
  const fx = TRIM + FRAME;
  const fy = TRIM + FRAME;
  const fw = SHEET_W - 2 * fx;
  const fh = SHEET_H - 2 * fy;
  parts.push(`<rect x="${n(fx)}" y="${n(fy)}" width="${n(fw)}" height="${n(fh)}" fill="none" stroke="${INK}" stroke-width="0.7"/>`);
  // Zone markers around the frame.
  const cols = 6;
  const rows = 4;
  for (let i = 0; i < cols; i += 1) {
    const cx = fx + (fw * (i + 0.5)) / cols;
    const label = String(i + 1);
    parts.push(`<text x="${n(cx)}" y="${n(TRIM + FRAME * 0.7)}" font-size="2.4" text-anchor="middle" fill="${DIM}">${label}</text>`);
    parts.push(`<text x="${n(cx)}" y="${n(SHEET_H - TRIM - FRAME * 0.25)}" font-size="2.4" text-anchor="middle" fill="${DIM}">${label}</text>`);
    if (i > 0) {
      const gx = fx + (fw * i) / cols;
      parts.push(`<line x1="${n(gx)}" y1="${n(TRIM)}" x2="${n(gx)}" y2="${n(fy)}" stroke="${INK}" stroke-width="0.3"/>`);
      parts.push(`<line x1="${n(gx)}" y1="${n(fy + fh)}" x2="${n(gx)}" y2="${n(SHEET_H - TRIM)}" stroke="${INK}" stroke-width="0.3"/>`);
    }
  }
  for (let i = 0; i < rows; i += 1) {
    const cy = fy + (fh * (i + 0.5)) / rows;
    const label = String.fromCharCode(65 + i);
    parts.push(`<text x="${n(TRIM + FRAME * 0.5)}" y="${n(cy + 1)}" font-size="2.4" text-anchor="middle" fill="${DIM}">${label}</text>`);
    parts.push(`<text x="${n(SHEET_W - TRIM - FRAME * 0.5)}" y="${n(cy + 1)}" font-size="2.4" text-anchor="middle" fill="${DIM}">${label}</text>`);
    if (i > 0) {
      const gy = fy + (fh * i) / rows;
      parts.push(`<line x1="${n(TRIM)}" y1="${n(gy)}" x2="${n(fx)}" y2="${n(gy)}" stroke="${INK}" stroke-width="0.3"/>`);
      parts.push(`<line x1="${n(fx + fw)}" y1="${n(gy)}" x2="${n(SHEET_W - TRIM)}" y2="${n(gy)}" stroke="${INK}" stroke-width="0.3"/>`);
    }
  }
  return parts.join('');
}

/* --------------------------------- sheet ---------------------------------- */

export interface SheetOptions {
  titleBlock: SheetTitleBlock;
  /** Draw a graphic scale bar with one tick every `stepModel` model units. */
  scaleBar?: { stepModel: number; unit: string };
  /** ARIA / accessibility title. */
  title: string;
}

/**
 * Frame a {@link Drawing} as a finished landscape-A4 drawing sheet SVG: border,
 * zone markers, title block, optional scale bar, and the diagram scaled to fill
 * the drawing window with paper-fixed annotation. The viewBox is the sheet in mm
 * so callers can `fit` it to the page.
 */
export function drawingSheetSvg(d: Drawing, opts: SheetOptions): string {
  // Drawing window: inside the frame, above the title-block band.
  const fx = TRIM + FRAME + PAD;
  const fy = TRIM + FRAME + PAD;
  const winW = SHEET_W - 2 * fx;
  const winH = SHEET_H - fy - (TRIM + FRAME) - TITLE_H - 2 * PAD;

  const box = drawingBounds(d);
  const bw = Math.max(box.maxX - box.minX, 1);
  const bh = Math.max(box.maxY - box.minY, 1);
  const s = Math.min(winW / bw, winH / bh, MAX_SCALE);
  // Centre the scaled geometry in the window.
  const ox = fx + (winW - bw * s) / 2 - box.minX * s;
  const oy = fy + (winH - bh * s) / 2 - box.minY * s;
  const t: Tx = { s, ox, oy };

  const body = d.prims.map((p) => primToSheet(p, t)).join('');
  const frame = frameSvg();

  // Title block in the bottom-right; scale bar in the bottom-left of the band.
  const tbW = 132;
  const tbH = TITLE_H;
  const tbLeft = SHEET_W - (TRIM + FRAME) - tbW;
  const tbTop = SHEET_H - (TRIM + FRAME) - tbH;
  const tb = titleBlockSvg(opts.titleBlock, tbLeft, tbTop, tbW, tbH);

  const bar = opts.scaleBar
    ? scaleBarSvg(t, TRIM + FRAME + PAD + 2, tbTop + tbH - 4, opts.scaleBar.stepModel, opts.scaleBar.unit)
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" ` +
    `viewBox="0 0 ${SHEET_W} ${SHEET_H}" font-family="Helvetica, Arial, sans-serif" ` +
    `role="img" aria-label="${escapeXml(opts.title)}">` +
    `<rect x="0" y="0" width="${SHEET_W}" height="${SHEET_H}" fill="#ffffff"/>` +
    frame +
    body +
    bar +
    tb +
    `</svg>`
  );
}

/* ----------------------------- panel sheets ------------------------------- */

/**
 * The single-line diagram of a panel as a finished CAD sheet (landscape A4 with
 * border, title block and legible paper-fixed annotation). The SLD geometry is
 * schematic, so the scale field reads "NTS".
 */
export function panelSldSheet(
  panel: PanelInput,
  result: PanelResult,
  titleBlock: SheetTitleBlock = {},
): string {
  const d = layoutSld(panel, result);
  return drawingSheetSvg(d, {
    titleBlock: { ...titleBlock, sheet: titleBlock.sheet ?? 'Single-Line Diagram', scale: 'NTS' },
    title: `${panelLabel(panel)} single-line diagram`,
  });
}

/**
 * The general-arrangement front view of a panel as a finished CAD sheet. The GA
 * is dimensionally true, so it carries a graphic scale bar and a nominal "1:N"
 * scale in the title block.
 */
export function panelGaSheet(
  panel: PanelInput,
  result: PanelResult,
  titleBlock: SheetTitleBlock = {},
): string {
  const d = gaDrawing(panel, result);
  return drawingSheetSvg(d, {
    titleBlock: {
      ...titleBlock,
      sheet: titleBlock.sheet ?? 'General Arrangement',
      scale: sheetScaleLabel(d),
    },
    title: `${panelLabel(panel)} general arrangement`,
    scaleBar: { stepModel: 100, unit: 'mm' },
  });
}

/** The lighting & small-power points plan of a panel as a finished CAD sheet. */
export function panelPointsSheet(
  panel: PanelInput,
  result: PanelResult,
  titleBlock: SheetTitleBlock = {},
): string {
  const d = pointsDrawing(panel, result);
  return drawingSheetSvg(d, {
    titleBlock: { ...titleBlock, sheet: titleBlock.sheet ?? 'Lighting & Small Power', scale: sheetScaleLabel(d) },
    title: `${panelLabel(panel)} lighting & switching`,
    scaleBar: { stepModel: 1000, unit: 'mm' },
  });
}

/** The plotted scale ratio "1:N" of a drawing in mm fitted to the A4 window. */
export function sheetScaleLabel(d: Drawing): string {
  const fx = TRIM + FRAME + PAD;
  const fy = TRIM + FRAME + PAD;
  const winW = SHEET_W - 2 * fx;
  const winH = SHEET_H - fy - (TRIM + FRAME) - TITLE_H - 2 * PAD;
  const box = drawingBounds(d);
  const bw = Math.max(box.maxX - box.minX, 1);
  const bh = Math.max(box.maxY - box.minY, 1);
  const s = Math.min(winW / bw, winH / bh, MAX_SCALE);
  if (s >= 1) return `${Math.round(s)}:1`;
  const inv = Math.round(1 / s);
  // Snap to a tidy nominal scale.
  const nominal = [1, 2, 5, 10, 15, 20, 25, 50, 100].find((v) => v >= inv) ?? inv;
  return `1:${nominal}`;
}
