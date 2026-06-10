/**
 * Pure SVG-string builder for a time-current coordination (TCC) plot: a log-log
 * current-time chart overlaying the tripping envelopes of one or more breakers so
 * an engineer can eyeball discrimination/selectivity (does the downstream device
 * clear before the upstream one for a given prospective fault?).
 *
 * No DOM, no Node — just string templating, mirroring the existing builders in
 * `./svg` (explicit width/height + viewBox, attribute-only styling, basic SVG
 * elements only: `rect line text polyline g`). Suitable for on-screen rendering,
 * PDF embedding (pdfmake via svg-to-pdfkit) and `.svg` export.
 *
 * Standards basis for the curves themselves lives in `../standards/tcc`
 * (IEC 60898-1 for MCBs, IEC 60947-2 for MCCBs).
 */

import type { BreakerClass, BreakerCurve } from '../standards/protection';
import { tripCurve, type CurveDevice } from '../standards/tcc';

/** Structural / axis ink colour. */
const INK = '#334155';
/** Grid line colour (faint). */
const GRID = '#e2e8f0';
/** Dimension / annotation colour. */
const DIM = '#64748b';
/** Fault marker colour. */
const FAULT = '#dc2626';
/** Minimum legible font size (SVG user units). */
const MIN_FONT = 6;

/**
 * Palette cycled across devices so overlaid curves stay distinguishable. Plain
 * hex strings — no CSS, no gradients, to satisfy the PDF SVG subset.
 */
const DEVICE_COLOURS: readonly string[] = [
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be123c', // rose
];

/** A device to overlay on the TCC plot. */
export interface TccDevice {
  /** Legend / curve label, e.g. "Q1 main 250A". */
  label: string;
  /** Breaker family — selects the inverse-time model. */
  deviceClass: BreakerClass;
  /** Trip curve letter — selects the magnetic band (MCB) / pickup (MCCB). */
  curve: BreakerCurve;
  /** Rated current In (amperes). */
  ratingA: number;
}

/** Input to {@link buildTccSvg}. */
export interface BuildTccInput {
  /** Devices whose trip curves are overlaid; empty is allowed (axes only). */
  devices: TccDevice[];
  /** Optional prospective fault current (A) drawn as a vertical reference line. */
  faultA?: number;
  /** Output width in pixels (default 720). */
  widthPx?: number;
  /** Output height in pixels (default 560). */
  heightPx?: number;
}

/* ------------------------------ plot extents ------------------------------ */

/** Current axis (X) range in amperes: 1 A → 100 kA. */
const I_MIN = 1;
const I_MAX = 100_000;
/** Time axis (Y) range in seconds: 0.01 s → 1000 s. */
const T_MIN = 0.01;
const T_MAX = 1000;

/** Inner plot margins (px) leaving room for axis labels. */
const MARGIN = { top: 24, right: 24, bottom: 48, left: 56 } as const;

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

/** Clamp a value into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Decade tick values spanning `[min, max]` inclusive, e.g. for 1..100000 →
 * `[1, 10, 100, 1000, 10000, 100000]`. Used for both axes (both are powers of ten).
 */
function decadeTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const start = Math.floor(Math.log10(min));
  const end = Math.ceil(Math.log10(max));
  for (let e = start; e <= end; e++) {
    const v = Math.pow(10, e);
    if (v >= min - 1e-9 && v <= max + 1e-9) ticks.push(v);
  }
  return ticks;
}

/** Compact tick label, e.g. 100000 → "100k", 0.01 → "0.01". */
function tickLabel(v: number): string {
  if (v >= 1000) return `${v / 1000}k`;
  if (v >= 1) return String(v);
  // Sub-unit times: trim trailing zeros.
  return String(Number(v.toPrecision(2)));
}

/* -------------------------------- builder -------------------------------- */

/**
 * Build a complete, self-contained `<svg>…</svg>` string for the TCC plot.
 *
 * Layout: a log-log grid (current on X increasing rightward, time on Y increasing
 * upward), decade gridlines + tick labels, each device's trip curve as a coloured
 * polyline with a legend entry, and — when `faultA` is supplied and positive — a
 * vertical red reference line at the prospective fault current.
 *
 * All data→pixel mapping uses base-10 logarithms; inputs ≤ 0 (ratings, faults) are
 * guarded (clamped into range / skipped) so the output is always valid SVG.
 *
 * @returns a standalone SVG document string.
 */
export function buildTccSvg(input: BuildTccInput): string {
  const width = input.widthPx && input.widthPx > 0 ? input.widthPx : 720;
  const height = input.heightPx && input.heightPx > 0 ? input.heightPx : 560;

  const plotX0 = MARGIN.left;
  const plotX1 = width - MARGIN.right;
  const plotY0 = MARGIN.top;
  const plotY1 = height - MARGIN.bottom;
  const plotW = Math.max(plotX1 - plotX0, 1);
  const plotH = Math.max(plotY1 - plotY0, 1);

  const logIMin = Math.log10(I_MIN);
  const logIMax = Math.log10(I_MAX);
  const logTMin = Math.log10(T_MIN);
  const logTMax = Math.log10(T_MAX);

  /** Map a current (A) to an X pixel; clamps to the axis range. */
  const xOf = (i: number): number => {
    const safe = clamp(i, I_MIN, I_MAX);
    const f = (Math.log10(safe) - logIMin) / (logIMax - logIMin);
    return plotX0 + f * plotW;
  };
  /** Map a time (s) to a Y pixel (time increases upward). */
  const yOf = (t: number): number => {
    const safe = clamp(t, T_MIN, T_MAX);
    const f = (Math.log10(safe) - logTMin) / (logTMax - logTMin);
    return plotY1 - f * plotH;
  };

  const parts: string[] = [];

  // --- Plot frame. ---
  parts.push(
    `<rect x="${n(plotX0)}" y="${n(plotY0)}" width="${n(plotW)}" height="${n(plotH)}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`,
  );

  // --- Gridlines + tick labels. ---
  for (const i of decadeTicks(I_MIN, I_MAX)) {
    const x = xOf(i);
    parts.push(
      `<line x1="${n(x)}" y1="${n(plotY0)}" x2="${n(x)}" y2="${n(plotY1)}" stroke="${GRID}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${n(x)}" y="${n(plotY1 + MIN_FONT * 2.4)}" font-size="${n(MIN_FONT * 1.4)}" text-anchor="middle" fill="${DIM}">${escapeXml(tickLabel(i))}</text>`,
    );
  }
  for (const t of decadeTicks(T_MIN, T_MAX)) {
    const y = yOf(t);
    parts.push(
      `<line x1="${n(plotX0)}" y1="${n(y)}" x2="${n(plotX1)}" y2="${n(y)}" stroke="${GRID}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${n(plotX0 - 6)}" y="${n(y + MIN_FONT * 0.5)}" font-size="${n(MIN_FONT * 1.4)}" text-anchor="end" fill="${DIM}">${escapeXml(tickLabel(t))}</text>`,
    );
  }

  // --- Axis titles. ---
  parts.push(
    `<text x="${n((plotX0 + plotX1) / 2)}" y="${n(height - MIN_FONT)}" font-size="${n(MIN_FONT * 1.6)}" text-anchor="middle" fill="${INK}">Current (A)</text>`,
  );
  // Rotated Y-axis title.
  const yTitleX = MIN_FONT * 1.6;
  const yTitleY = (plotY0 + plotY1) / 2;
  parts.push(
    `<text x="${n(yTitleX)}" y="${n(yTitleY)}" font-size="${n(MIN_FONT * 1.6)}" text-anchor="middle" fill="${INK}" transform="rotate(-90 ${n(yTitleX)} ${n(yTitleY)})">Time (s)</text>`,
  );

  // --- Device trip curves. ---
  input.devices.forEach((dev, idx) => {
    const colour = DEVICE_COLOURS[idx % DEVICE_COLOURS.length] ?? INK;
    const cd: CurveDevice = {
      deviceClass: dev.deviceClass,
      curve: dev.curve,
      ratingA: dev.ratingA,
    };
    const curve = tripCurve(cd);
    if (curve.length > 0) {
      const pts = curve.map((p) => `${n(xOf(p.i))},${n(yOf(p.t))}`).join(' ');
      parts.push(
        `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="1.6"/>`,
      );
    }
    // Legend swatch + label, stacked at top-right inside the plot.
    const ly = plotY0 + 6 + idx * (MIN_FONT * 1.8);
    const lx = plotX1 - 140;
    parts.push(
      `<line x1="${n(lx)}" y1="${n(ly + MIN_FONT)}" x2="${n(lx + 18)}" y2="${n(ly + MIN_FONT)}" stroke="${colour}" stroke-width="1.6"/>`,
    );
    parts.push(
      `<text x="${n(lx + 24)}" y="${n(ly + MIN_FONT * 1.4)}" font-size="${n(MIN_FONT * 1.3)}" fill="${INK}">${escapeXml(dev.label)}</text>`,
    );
  });

  // --- Optional prospective-fault vertical line. ---
  if (input.faultA !== undefined && Number.isFinite(input.faultA) && input.faultA > 0) {
    const fx = xOf(input.faultA);
    parts.push(
      `<line x1="${n(fx)}" y1="${n(plotY0)}" x2="${n(fx)}" y2="${n(plotY1)}" stroke="${FAULT}" stroke-width="1.4" stroke-dasharray="6 4"/>`,
    );
    parts.push(
      `<text x="${n(fx + 4)}" y="${n(plotY0 + MIN_FONT * 1.6)}" font-size="${n(MIN_FONT * 1.3)}" fill="${FAULT}">Ik ${escapeXml(tickLabel(input.faultA))}A</text>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="Helvetica, Arial, sans-serif" ` +
    `role="img" aria-label="Time-current coordination plot">` +
    parts.join('') +
    `</svg>`
  );
}
