/**
 * Pure single-line-diagram (SLD) layout: an incomer breaker feeding a horizontal
 * busbar, with one branch drop per circuit carrying a breaker symbol and the load
 * at its foot. Produces the shared {@link Drawing} primitive list consumed by the
 * SVG builder (`./svg`) and the DXF writer (`./dxf`), so screen, PDF and CAD stay
 * in lock-step.
 *
 * Coordinates are abstract user units in Y-DOWN screen space (origin top-left);
 * the DXF writer flips Y for a conventional Y-UP CAD drawing.
 */

import type { PanelInput } from '../types/project';
import type { PanelResult } from '../types/results';
import { panelLabel } from '../labels';
import { INCOMER_TAG, circuitTag, pdfGlyphs, type Drawing, type Prim } from './geometry';

/** Horizontal pitch between branch drops (user units). */
const BRANCH_PITCH = 130;
/** Left margin before the first branch. */
const MARGIN_X = 30;
/** Top margin above the incomer. */
const MARGIN_Y = 24;
/** Vertical band heights, relative to a section's bus line. */
const INCOMER_Y = MARGIN_Y + 24;
const BUS_Y = INCOMER_Y + 70;
const BREAKER_DY = 56;
const LOAD_DY = BREAKER_DY + 78;
/** Vertical pitch between consecutive busbar sections (bus + its branch band). */
const SECTION_STEP = LOAD_DY + 74;

/** Breaker symbol: a small square on the conductor. */
const BREAKER_W = 26;
const BREAKER_H = 18;
/** Load symbol box. */
const LOAD_W = 96;
const LOAD_H = 34;
/** Label font size (user units). */
const FONT = 9;

/**
 * Wrap a label into at most two lines near a target line length, breaking on the
 * space closest to the midpoint. Keeps long load names inside their box instead
 * of overflowing into the neighbouring column.
 */
function wrapLabel(text: string, maxChars = 16): string[] {
  if (text.length <= maxChars) return [text];
  const mid = Math.floor(text.length / 2);
  let split = -1;
  for (let d = 0; d < text.length; d += 1) {
    if (text[mid - d] === ' ') {
      split = mid - d;
      break;
    }
    if (text[mid + d] === ' ') {
      split = mid + d;
      break;
    }
  }
  if (split === -1) return [text];
  return [text.slice(0, split), text.slice(split + 1)];
}

/**
 * Push a breaker / switch-disconnector symbol centred on `x` with its top at
 * `topY`: the device box plus a diagonal switch blade and a hinge dot, so it
 * reads as a protective device rather than an empty rectangle.
 */
function pushBreaker(prims: Prim[], x: number, topY: number): void {
  prims.push({ type: 'rect', x: x - BREAKER_W / 2, y: topY, w: BREAKER_W, h: BREAKER_H, weight: 1.2, accent: true });
  // Switch blade across the box (open-on-paper convention) + hinge dot.
  const hx = x - BREAKER_W / 2 + 4;
  const hy = topY + BREAKER_H - 4;
  prims.push({ type: 'line', x1: hx, y1: hy, x2: x + BREAKER_W / 2 - 4, y2: topY + 4, weight: 1.2 });
  prims.push({ type: 'circle', cx: hx, cy: hy, r: 1.4, weight: 0.8, filled: true });
}

/** Build the SLD {@link Drawing} for one panel. */
export function layoutSld(panel: PanelInput, result: PanelResult): Drawing {
  const sections = result.busbarSections;
  const multi = sections.length > 1;
  const byId = new Map(result.circuits.map((c) => [c.circuitId, c] as const));
  // Q1, Q2 … per circuit in panel order — the same tag the GA and schedule use.
  const tagOf = new Map(result.circuits.map((c, i) => [c.circuitId, circuitTag(i)] as const));
  const maxWays = Math.max(...sections.map((s) => Math.max(s.ways, 1)), 1);
  const width = MARGIN_X * 2 + (maxWays - 1) * BRANCH_PITCH + LOAD_W;
  const lastSectionBusY = BUS_Y + (sections.length - 1) * SECTION_STEP;
  const height = lastSectionBusY + LOAD_DY + LOAD_H + MARGIN_Y;

  // Each branch sits at the centre of its column (section-local index).
  const branchX = (i: number) => MARGIN_X + LOAD_W / 2 + i * BRANCH_PITCH;
  const busLeft = branchX(0) - 20;

  const prims: Prim[] = [];

  // --- Incomer: a labelled breaker feeding section 0's bus from above. ---
  const sec0Count = Math.max(sections[0]!.ways, 1);
  const incomerMidX = (branchX(0) + branchX(sec0Count - 1)) / 2;
  const inc = result.incomer;
  pushBreaker(prims, incomerMidX, INCOMER_Y);
  // Supply lead in (with an upstream terminal dot) and the drop to the bus.
  prims.push({ type: 'line', x1: incomerMidX, y1: MARGIN_Y, x2: incomerMidX, y2: INCOMER_Y, weight: 1.6 });
  prims.push({ type: 'circle', cx: incomerMidX, cy: MARGIN_Y, r: 2, weight: 1, filled: true });
  prims.push({ type: 'line', x1: incomerMidX, y1: INCOMER_Y + BREAKER_H, x2: incomerMidX, y2: BUS_Y, weight: 1.6 });
  // Main device tag (left of the box) + the panel + incomer spec (to the right;
  // the sheet fits the full text extent so this no longer clips at the edge).
  prims.push({
    type: 'text',
    x: incomerMidX - BREAKER_W / 2 - 5,
    y: INCOMER_Y + BREAKER_H / 2 + FONT / 3,
    text: INCOMER_TAG,
    size: FONT,
    anchor: 'end',
    bold: true,
  });
  prims.push({
    type: 'text',
    x: incomerMidX + BREAKER_W / 2 + 6,
    y: INCOMER_Y + BREAKER_H / 2,
    text: pdfGlyphs(panelLabel(panel)),
    size: FONT,
    bold: true,
  });
  prims.push({
    type: 'text',
    x: incomerMidX + BREAKER_W / 2 + 6,
    y: INCOMER_Y + BREAKER_H / 2 + FONT + 1,
    text: `${inc.breaker.deviceClass} ${inc.breaker.ratingA}A ${inc.breaker.curve} ${inc.poles}P${inc.breakerKa ? ` ${inc.breakerKa}kA` : ''} · Ib ${result.totalDemandCurrentA.toFixed(0)}A`,
    size: FONT - 1,
    dim: true,
  });

  // --- One busbar section per row, each fed RADIALLY from the incomer. ---
  // The left-margin rail is the incomer feed conductor (it carries the
  // downstream sections' current); the section bars themselves only carry
  // their own group, which is what their per-section sizing assumes.
  const railX = busLeft - 14;
  if (sections.length > 1) {
    const lastBusY = BUS_Y + (sections.length - 1) * SECTION_STEP;
    prims.push({ type: 'line', x1: railX, y1: BUS_Y, x2: railX, y2: lastBusY, weight: 2 });
    prims.push({ type: 'line', x1: busLeft, y1: BUS_Y, x2: railX, y2: BUS_Y, weight: 2 });
    prims.push({
      type: 'text',
      x: railX - 4,
      y: BUS_Y + 24,
      text: 'feed',
      size: FONT,
      dim: true,
    });
  }
  sections.forEach((section, k) => {
    const busY = BUS_Y + k * SECTION_STEP;
    const breakerY = busY + BREAKER_DY;
    const loadY = busY + LOAD_DY;
    const count = Math.max(section.ways, 1);
    const busX1 = branchX(0);
    const busX2 = branchX(count - 1);
    const bus = section.busbar;

    // Radial dropper: tap from the feed rail into this section's bar.
    if (k > 0) {
      prims.push({ type: 'line', x1: railX, y1: busY, x2: busX1 - 20, y2: busY, weight: 2 });
      prims.push({ type: 'circle', cx: railX, cy: busY, r: 2.4, weight: 1 });
    }

    // The thick horizontal bar.
    prims.push({ type: 'line', x1: busX1 - 20, y1: busY, x2: busX2 + 20, y2: busY, weight: 4 });
    prims.push({
      type: 'text',
      x: busX1 - 20,
      y: busY - 8,
      text: `${multi ? `Busbar §${section.index}` : 'Busbar'} ${bus.widthMm}×${bus.thicknessMm} mm · ${bus.ampacityA.toFixed(0)} A`,
      size: FONT,
      dim: true,
    });

    // One branch drop per circuit on this section.
    section.circuitIds.forEach((cid, i) => {
      const c = byId.get(cid);
      if (!c) return;
      const x = branchX(i);
      const tag = tagOf.get(cid) ?? '';
      const isFeeder = c.loadKind === 'feeder';

      // Drop from the bus to the breaker, with a filled tap dot at the bus.
      prims.push({ type: 'line', x1: x, y1: busY, x2: x, y2: breakerY, weight: 1.2 });
      prims.push({ type: 'circle', cx: x, cy: busY, r: 2.2, weight: 1, filled: true });

      // Breaker symbol + its tag (left) and rating/poles (above).
      pushBreaker(prims, x, breakerY);
      prims.push({
        type: 'text',
        x: x - BREAKER_W / 2 - 4,
        y: breakerY + BREAKER_H / 2 + FONT / 3,
        text: tag,
        size: FONT - 1,
        anchor: 'end',
        bold: true,
      });
      prims.push({
        type: 'text',
        x: x,
        y: breakerY - 6,
        text: `${c.breaker.ratingA}A ${c.breaker.curve}${c.phase === '3ph' ? ' 3P' : ''}`,
        size: FONT - 1,
        anchor: 'middle',
      });

      // Conductor from breaker to load, annotated with the cable make-up.
      prims.push({ type: 'line', x1: x, y1: breakerY + BREAKER_H, x2: x, y2: loadY, weight: 1.2 });
      prims.push({
        type: 'text',
        x: x + 5,
        y: (breakerY + BREAKER_H + loadY) / 2,
        text: c.grounding.cableSpec || `${c.cable.runsPerPhase && c.cable.runsPerPhase > 1 ? `${c.cable.runsPerPhase}× ` : ''}${c.cable.csaMm2} mm²`,
        size: FONT - 1.5,
        anchor: 'start',
        dim: true,
      });

      // Load box + name. A feeder destination is drawn as a sub-board (double
      // border); a plain load gets a single box.
      prims.push({ type: 'rect', x: x - LOAD_W / 2, y: loadY, w: LOAD_W, h: LOAD_H, weight: 1 });
      if (isFeeder) {
        prims.push({ type: 'rect', x: x - LOAD_W / 2 + 2.5, y: loadY + 2.5, w: LOAD_W - 5, h: LOAD_H - 5, weight: 0.6 });
      }
      const lines = wrapLabel(pdfGlyphs(c.name));
      const lineH = FONT - 0.5;
      const startY = loadY + LOAD_H / 2 + FONT / 3 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((ln, li) => {
        prims.push({
          type: 'text',
          x,
          y: startY + li * lineH,
          text: ln,
          size: FONT - 1,
          anchor: 'middle',
        });
      });
    });
  });

  return { width, height, prims };
}
