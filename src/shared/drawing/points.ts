/**
 * Final-circuit points & switching diagram (pure layout).
 *
 * One band per point-modelled circuit (fixtures / sockets): the circuit tag on
 * the left, a vertical trunk, and one sub-row per switch group — the switch
 * symbol (conventional lever or smart module) feeding the lamp symbols of the
 * fixture rows it controls — plus a direct (unswitched) sub-row and socket
 * chains for outlet circuits. Symbols are IEC-flavoured approximations built
 * only from the shared {@link Prim} vocabulary (line/rect/circle/text), so the
 * same geometry renders to SVG (screen + PDF embed) and DXF.
 */

import type { CircuitInput, PanelInput } from '../types/project';
import type { PanelResult } from '../types/results';
import type { LightFixture, SwitchGroup } from '../types/fixtures';
import { VA_PER_SOCKET_POINT } from '../standards/fixtures';
import { derivedPointsLoadW } from '../engine/fixtures';
import type { Drawing, Prim } from './geometry';
import { drawingToSvg, type TitleStrip } from './svg';
import { drawingToDxf } from './dxf';

/* ------------------------------ layout metrics ----------------------------- */

const DRAWING_W = 640;
const MARGIN = 12;
/** Tag block (circuit name + breaker) on the left of each band. */
const TAG_W = 132;
const TAG_H = 26;
/** X where the sub-row branch lines start (after the trunk). */
const BRANCH_X = TAG_W + 28;
/** X of the switch symbol on a sub-row. */
const SWITCH_X = BRANCH_X + 38;
/** X where the fixture/socket symbols + labels begin. */
const ITEM_X = SWITCH_X + 46;
/** Vertical pitch of one fixture/socket row line. */
const ROW_H = 16;
/** Gap between sub-rows (switch groups) inside one circuit band. */
const SUB_GAP = 8;
/** Gap between circuit bands. */
const BAND_GAP = 18;
const FONT = 7;
const FONT_SM = 6;

/* -------------------------------- symbols --------------------------------- */

/** Luminaire: circle with an inscribed X (IEC lamp symbol). */
function lampSymbol(prims: Prim[], cx: number, cy: number): void {
  const r = 4.2;
  const d = r * Math.SQRT1_2;
  prims.push({ type: 'circle', cx, cy, r, weight: 0.9 });
  prims.push({ type: 'line', x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, weight: 0.9 });
  prims.push({ type: 'line', x1: cx - d, y1: cy + d, x2: cx + d, y2: cy - d, weight: 0.9 });
}

/** Socket outlet: circle with a top chord + stub (semicircle approximation). */
function socketSymbol(prims: Prim[], cx: number, cy: number): void {
  const r = 4.2;
  prims.push({ type: 'circle', cx, cy, r, weight: 0.9 });
  prims.push({ type: 'line', x1: cx - r, y1: cy, x2: cx + r, y2: cy, weight: 0.9 });
  prims.push({ type: 'line', x1: cx, y1: cy - r, x2: cx, y2: cy - r - 5, weight: 0.9 });
}

/** Conventional switch: terminal dot + lever stroke(s); a 2-way gets two levers. */
function conventionalSwitchSymbol(
  prims: Prim[],
  x: number,
  y: number,
  g: SwitchGroup,
): void {
  prims.push({ type: 'circle', cx: x, cy: y, r: 1.6, weight: 0.9 });
  // Lever stroke up-right (the classic one-way switch symbol).
  prims.push({ type: 'line', x1: x, y1: y, x2: x + 9, y2: y - 7, weight: 1.1 });
  if (g.ways === 2) {
    // Second lever for two-way (hotel/staircase) control.
    prims.push({ type: 'line', x1: x, y1: y, x2: x + 9, y2: y + 7, weight: 1.1 });
  }
  if ((g.gang ?? 1) > 1) {
    prims.push({ type: 'text', x: x + 4, y: y - 9, text: `${g.gang}g`, size: FONT_SM, dim: true });
  }
}

/** Smart switch: small module box with "S" and an antenna mark. */
function smartSwitchSymbol(prims: Prim[], x: number, y: number): void {
  const w = 13;
  const h = 11;
  prims.push({ type: 'rect', x: x - w / 2, y: y - h / 2, w, h, weight: 0.9, accent: true });
  prims.push({ type: 'text', x, y: y + 2.4, text: 'S', size: FONT, anchor: 'middle' });
  // Antenna: a small V on top of the module.
  prims.push({ type: 'line', x1: x, y1: y - h / 2, x2: x - 3.2, y2: y - h / 2 - 4.5, weight: 0.8 });
  prims.push({ type: 'line', x1: x, y1: y - h / 2, x2: x + 3.2, y2: y - h / 2 - 4.5, weight: 0.8 });
}

/* --------------------------------- layout ---------------------------------- */

/** A switch group's sub-row: which fixture rows it feeds (or none = direct). */
interface SubRow {
  group?: SwitchGroup;
  fixtures: LightFixture[];
}

/** Sub-rows of a lighting circuit: one per switch group, plus the unswitched rows. */
function lightingSubRows(c: CircuitInput): SubRow[] {
  const fixtures = c.fixtures ?? [];
  const groups = c.switchGroups ?? [];
  const groupIds = new Set(groups.map((g) => g.id));
  const rows: SubRow[] = groups.map((g) => ({
    group: g,
    fixtures: fixtures.filter((f) => f.switchGroupId === g.id),
  }));
  const unswitched = fixtures.filter(
    (f) => f.switchGroupId === undefined || !groupIds.has(f.switchGroupId),
  );
  if (unswitched.length > 0) rows.push({ fixtures: unswitched });
  return rows;
}

/** Height of one sub-row (≥ one row line even when the group is empty). */
function subRowHeight(rows: number): number {
  return Math.max(1, rows) * ROW_H;
}

/** Lay out one circuit band; returns its total height. */
function layoutBand(
  prims: Prim[],
  c: CircuitInput,
  breakerLabel: string,
  yTop: number,
): number {
  const isLighting = (c.fixtures ?? []).length > 0;
  const subs: SubRow[] = isLighting
    ? lightingSubRows(c)
    : [{ fixtures: [] }]; // sockets: one chain sub-row

  const socketRows = c.sockets ?? [];
  const heights = isLighting
    ? subs.map((s) => subRowHeight(s.fixtures.length))
    : [subRowHeight(socketRows.length)];
  const bandH = Math.max(
    TAG_H + 8,
    heights.reduce((a, b) => a + b, 0) + SUB_GAP * (heights.length - 1),
  );

  // Circuit tag.
  const tagY = yTop + bandH / 2 - TAG_H / 2;
  prims.push({ type: 'rect', x: 0, y: tagY, w: TAG_W, h: TAG_H, weight: 1 });
  prims.push({
    type: 'text',
    x: 6,
    y: tagY + 10.5,
    text: c.name,
    size: FONT,
  });
  prims.push({
    type: 'text',
    x: 6,
    y: tagY + 20.5,
    text: `${breakerLabel} · ${derivedPointsLoadW(c) ?? c.loadW} W`,
    size: FONT_SM,
    dim: true,
  });

  // Trunk from the tag to the sub-row branches.
  const trunkX = BRANCH_X - 10;
  prims.push({
    type: 'line',
    x1: TAG_W,
    y1: tagY + TAG_H / 2,
    x2: trunkX,
    y2: tagY + TAG_H / 2,
    weight: 1.1,
  });

  let y = yTop;
  const branchYs: number[] = [];
  subs.forEach((sub, i) => {
    const h = heights[i]!;
    const midY = y + h / 2;
    branchYs.push(midY);

    // Branch line from the trunk to the switch / items.
    prims.push({ type: 'line', x1: trunkX, y1: midY, x2: SWITCH_X - 8, y2: midY, weight: 0.9 });

    if (isLighting) {
      // Switch symbol (or a plain feed-through for the unswitched sub-row).
      if (sub.group) {
        if (sub.group.kind === 'smart') smartSwitchSymbol(prims, SWITCH_X, midY);
        else conventionalSwitchSymbol(prims, SWITCH_X, midY, sub.group);
        const detail =
          sub.group.kind === 'smart'
            ? `${sub.group.label} (${sub.group.protocol ?? 'smart'})`
            : sub.group.label;
        prims.push({
          type: 'text',
          x: SWITCH_X,
          y: midY + (sub.group.kind === 'smart' ? 12 : 11),
          text: detail,
          size: FONT_SM,
          anchor: 'middle',
          dim: true,
        });
      } else {
        prims.push({ type: 'line', x1: SWITCH_X - 8, y1: midY, x2: SWITCH_X + 8, y2: midY, weight: 0.9 });
        prims.push({
          type: 'text',
          x: SWITCH_X,
          y: midY + 11,
          text: 'unswitched',
          size: FONT_SM,
          anchor: 'middle',
          dim: true,
        });
      }

      // Fixture rows fanned from the switch.
      const rows = sub.fixtures.length > 0 ? sub.fixtures : undefined;
      if (rows) {
        rows.forEach((f, ri) => {
          const ry = y + ri * ROW_H + ROW_H / 2;
          prims.push({ type: 'line', x1: SWITCH_X + 9, y1: midY, x2: ITEM_X - 7, y2: ry, weight: 0.8 });
          lampSymbol(prims, ITEM_X, ry);
          prims.push({
            type: 'text',
            x: ITEM_X + 9,
            y: ry + 2.4,
            text: `${f.qty} × ${f.name} (${f.wattsPerFitting} W)`,
            size: FONT,
          });
        });
      }
    } else {
      // Socket circuit: a chain of outlet rows directly off the branch.
      socketRows.forEach((s, ri) => {
        const ry = y + ri * ROW_H + ROW_H / 2;
        prims.push({ type: 'line', x1: SWITCH_X - 8, y1: midY, x2: ITEM_X - 7, y2: ry, weight: 0.8 });
        socketSymbol(prims, ITEM_X, ry);
        const va = s.vaPerPoint ?? VA_PER_SOCKET_POINT;
        prims.push({
          type: 'text',
          x: ITEM_X + 9,
          y: ry + 2.4,
          text: `${s.qty} × ${s.name} (${va} VA${s.type === 'dedicated' ? ', dedicated' : ''})`,
          size: FONT,
        });
      });
    }

    y += h + SUB_GAP;
  });

  // Vertical trunk spanning the branches.
  if (branchYs.length > 1) {
    prims.push({
      type: 'line',
      x1: trunkX,
      y1: Math.min(...branchYs),
      x2: trunkX,
      y2: Math.max(...branchYs),
      weight: 1.1,
    });
  }

  return bandH;
}

/* --------------------------------- public ---------------------------------- */

/**
 * Build the points & switching {@link Drawing} for a panel. Only circuits that
 * carry point detail (fixtures/sockets) are drawn; an empty panel yields a
 * single explanatory note.
 */
export function pointsDrawing(panel: PanelInput, result: PanelResult): Drawing {
  const prims: Prim[] = [];
  const detailed = panel.circuits.filter(
    (c) => (c.fixtures ?? []).length > 0 || (c.sockets ?? []).length > 0,
  );

  // Header / legend.
  prims.push({
    type: 'text',
    x: 0,
    y: 8,
    text: `${panel.name} — lighting & small-power points`,
    size: FONT + 1,
  });
  let y = 20;
  if (detailed.length === 0) {
    prims.push({
      type: 'text',
      x: 0,
      y: y + 8,
      text: 'No point-modelled circuits — add fixtures/sockets in the circuit points editor.',
      size: FONT,
      dim: true,
    });
    return { width: DRAWING_W, height: y + 24, prims };
  }

  // Legend strip.
  lampSymbol(prims, 8, y + 4);
  prims.push({ type: 'text', x: 17, y: y + 6.5, text: 'luminaire', size: FONT_SM, dim: true });
  socketSymbol(prims, 86, y + 4);
  prims.push({ type: 'text', x: 95, y: y + 6.5, text: 'socket outlet', size: FONT_SM, dim: true });
  conventionalSwitchSymbol(prims, 172, y + 5, { id: '', label: '', kind: 'conventional' });
  prims.push({ type: 'text', x: 185, y: y + 6.5, text: 'switch', size: FONT_SM, dim: true });
  smartSwitchSymbol(prims, 238, y + 4);
  prims.push({ type: 'text', x: 248, y: y + 6.5, text: 'smart switch', size: FONT_SM, dim: true });
  y += 24;

  for (const c of detailed) {
    const r = result.circuits.find((x) => x.circuitId === c.id);
    const breakerLabel = r
      ? `${r.breaker.deviceClass} ${r.breaker.ratingA} A ${r.breaker.curve}`
      : '—';
    const bandH = layoutBand(prims, c, breakerLabel, y);
    y += bandH + BAND_GAP;
  }

  return { width: DRAWING_W, height: y - BAND_GAP + MARGIN, prims };
}

/** Self-contained SVG of the points & switching diagram. */
export function panelPointsSvg(
  panel: PanelInput,
  result: PanelResult,
  titleStrip?: TitleStrip,
): string {
  return drawingToSvg(pointsDrawing(panel, result), `${panel.name} points & switching`, titleStrip);
}

/** Minimal AutoCAD R12 ASCII DXF of the points & switching diagram. */
export function panelPointsDxf(panel: PanelInput, result: PanelResult): string {
  return drawingToDxf(pointsDrawing(panel, result));
}
