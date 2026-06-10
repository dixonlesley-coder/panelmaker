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
/** Vertical band heights. */
const INCOMER_Y = MARGIN_Y + 24;
const BUS_Y = INCOMER_Y + 70;
const BREAKER_Y = BUS_Y + 56;
const LOAD_Y = BREAKER_Y + 78;

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
  const branches = result.circuits;
  const count = Math.max(branches.length, 1);
  const width = MARGIN_X * 2 + (count - 1) * BRANCH_PITCH + LOAD_W;
  const height = LOAD_Y + LOAD_H + MARGIN_Y;

  // Each branch sits at the centre of its column.
  const branchX = (i: number) => MARGIN_X + LOAD_W / 2 + i * BRANCH_PITCH;
  const busX1 = branchX(0);
  const busX2 = branchX(count - 1);
  const busMidX = (busX1 + busX2) / 2;

  const prims: Prim[] = [];

  // --- Incomer: a labelled breaker feeding the bus from above. ---
  prims.push({
    type: 'rect',
    x: busMidX - BREAKER_W / 2,
    y: INCOMER_Y,
    w: BREAKER_W,
    h: BREAKER_H,
    weight: 1.4,
    accent: true,
  });
  prims.push({ type: 'line', x1: busMidX, y1: MARGIN_Y, x2: busMidX, y2: INCOMER_Y, weight: 1.4 });
  prims.push({ type: 'line', x1: busMidX, y1: INCOMER_Y + BREAKER_H, x2: busMidX, y2: BUS_Y, weight: 1.4 });
  prims.push({
    type: 'text',
    x: busMidX + BREAKER_W / 2 + 6,
    y: INCOMER_Y + BREAKER_H / 2 + FONT / 3,
    text: `${panelLabel(panel)} · ${result.totalDemandCurrentA.toFixed(0)} A`,
    size: FONT,
  });

  // --- Busbar: a thick horizontal bar all branches hang off. ---
  prims.push({ type: 'line', x1: busX1 - 20, y1: BUS_Y, x2: busX2 + 20, y2: BUS_Y, weight: 4 });
  prims.push({
    type: 'text',
    x: busX1 - 20,
    y: BUS_Y - 8,
    text: `Busbar ${result.busbar.widthMm}×${result.busbar.thicknessMm} mm · ${result.busbar.ampacityA.toFixed(0)} A`,
    size: FONT,
    dim: true,
  });

  // --- One branch drop per circuit. ---
  branches.forEach((c, i) => {
    const x = branchX(i);

    // Drop from the bus to the breaker.
    prims.push({ type: 'line', x1: x, y1: BUS_Y, x2: x, y2: BREAKER_Y, weight: 1.2 });
    // Connection dot at the bus.
    prims.push({ type: 'circle', cx: x, cy: BUS_Y, r: 2.4, weight: 1 });

    // Breaker symbol.
    prims.push({
      type: 'rect',
      x: x - BREAKER_W / 2,
      y: BREAKER_Y,
      w: BREAKER_W,
      h: BREAKER_H,
      weight: 1.2,
      accent: true,
    });
    prims.push({
      type: 'text',
      x: x,
      y: BREAKER_Y - 6,
      text: `${c.breaker.ratingA}A ${c.breaker.curve}`,
      size: FONT,
      anchor: 'middle',
    });

    // Conductor from breaker to load.
    prims.push({ type: 'line', x1: x, y1: BREAKER_Y + BREAKER_H, x2: x, y2: LOAD_Y, weight: 1.2 });
    prims.push({
      type: 'text',
      x: x + 6,
      y: (BREAKER_Y + BREAKER_H + LOAD_Y) / 2,
      text: `${c.cable.csaMm2} mm²`,
      size: FONT,
      anchor: 'start',
      dim: true,
    });

    // Load box + name.
    prims.push({
      type: 'rect',
      x: x - LOAD_W / 2,
      y: LOAD_Y,
      w: LOAD_W,
      h: LOAD_H,
      weight: 1,
    });
    prims.push({
      type: 'text',
      x: x,
      y: LOAD_Y + LOAD_H / 2 + FONT / 3,
      text: c.name,
      size: FONT,
      anchor: 'middle',
    });
  });

  return { width, height, prims };
}
