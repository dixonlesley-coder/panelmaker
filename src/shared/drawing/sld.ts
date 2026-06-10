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
import type { Drawing, Prim } from './geometry';

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

/** Build the SLD {@link Drawing} for one panel. */
export function layoutSld(panel: PanelInput, result: PanelResult): Drawing {
  const sections = result.busbarSections;
  const multi = sections.length > 1;
  const byId = new Map(result.circuits.map((c) => [c.circuitId, c] as const));
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
  prims.push({
    type: 'rect',
    x: incomerMidX - BREAKER_W / 2,
    y: INCOMER_Y,
    w: BREAKER_W,
    h: BREAKER_H,
    weight: 1.4,
    accent: true,
  });
  prims.push({ type: 'line', x1: incomerMidX, y1: MARGIN_Y, x2: incomerMidX, y2: INCOMER_Y, weight: 1.4 });
  prims.push({ type: 'line', x1: incomerMidX, y1: INCOMER_Y + BREAKER_H, x2: incomerMidX, y2: BUS_Y, weight: 1.4 });
  prims.push({
    type: 'text',
    x: incomerMidX + BREAKER_W / 2 + 6,
    y: INCOMER_Y + BREAKER_H / 2 + FONT / 3,
    text: `${panelLabel(panel)} · ${result.incomer.breaker.deviceClass} ${result.incomer.breaker.ratingA}A ${result.incomer.poles}P (Ib ${result.totalDemandCurrentA.toFixed(0)} A)`,
    size: FONT,
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

      // Drop from the bus to the breaker.
      prims.push({ type: 'line', x1: x, y1: busY, x2: x, y2: breakerY, weight: 1.2 });
      // Connection dot at the bus.
      prims.push({ type: 'circle', cx: x, cy: busY, r: 2.4, weight: 1 });

      // Breaker symbol.
      prims.push({
        type: 'rect',
        x: x - BREAKER_W / 2,
        y: breakerY,
        w: BREAKER_W,
        h: BREAKER_H,
        weight: 1.2,
        accent: true,
      });
      prims.push({
        type: 'text',
        x: x,
        y: breakerY - 6,
        text: `${c.breaker.ratingA}A ${c.breaker.curve}`,
        size: FONT,
        anchor: 'middle',
      });

      // Conductor from breaker to load.
      prims.push({ type: 'line', x1: x, y1: breakerY + BREAKER_H, x2: x, y2: loadY, weight: 1.2 });
      prims.push({
        type: 'text',
        x: x + 6,
        y: (breakerY + BREAKER_H + loadY) / 2,
        text: `${c.cable.runsPerPhase && c.cable.runsPerPhase > 1 ? `${c.cable.runsPerPhase}× ` : ''}${c.cable.csaMm2} mm²`,
        size: FONT,
        anchor: 'start',
        dim: true,
      });

      // Load box + name.
      prims.push({
        type: 'rect',
        x: x - LOAD_W / 2,
        y: loadY,
        w: LOAD_W,
        h: LOAD_H,
        weight: 1,
      });
      prims.push({
        type: 'text',
        x: x,
        y: loadY + LOAD_H / 2 + FONT / 3,
        text: c.name,
        size: FONT,
        anchor: 'middle',
      });
    });
  });

  return { width, height, prims };
}
