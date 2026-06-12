import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  getSmoothStepPath,
  useNodesState,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Badge, Box, Button, Card, Drawer, Group, List, Menu, Modal, Paper, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { LOAD_DEFAULTS, STANDARD_BREAKER_RATINGS_A } from '@shared/standards';
import { STANDARD_SECTIONS_MM2 } from '@shared/standards/conductors';
import {
  IconAirConditioning,
  IconBattery2,
  IconBolt,
  IconBulb,
  IconChargingPile,
  IconCircuitSwitchOpen,
  IconDroplet,
  IconEngine,
  IconFireHydrant,
  IconFlame,
  IconHandMove,
  IconPlug,
  IconPlugConnected,
  IconServer,
  IconSitemap,
  IconSolarPanel,
} from '@tabler/icons-react';
import type { CircuitInput, LoadKind, PanelInput, Part, PhaseAssignment, ProjectInput, SystemResult } from '@shared/types';
import { circuitOrderCodes } from '@shared/engine/bom';
import { balancePhases, type PhaseCircuit } from '@shared/engine';
import { partsForBrand } from '@shared/data/catalog';
import { formatAmps, formatKw } from '@renderer/lib/format';
import { toNodeIssues } from '@renderer/lib/nodeIssues';
import { NodeIssues, type NodeIssue } from '@renderer/screens/sld/nodes';
import { dropIndex, reorderIds } from '@renderer/lib/reorder';
import { fedSubPanelNames, serviceRootId } from '@renderer/lib/panelTree';
import { useProjectStore, type FloatingLoad } from '@renderer/state/projectStore';
import { PanelEditor } from '@renderer/screens/PanelEditor';
import { CanvasHelp } from '@renderer/screens/sld/CanvasHelp';
import { CircuitEditor } from '@renderer/features/builder/CircuitEditor';
import { PanelSettingsEditor } from '@renderer/features/builder/PanelSettingsEditor';
import { DEFAULT_BATTERY, DEFAULT_GENERATOR, DEFAULT_SOLAR } from '@renderer/data/sourceDefaults';

/* Palette: drag a card onto a panel to add the way/sub-panel there. */
const SLD_DND = 'application/x-panelmaker-sld-add';
type SourceKind = 'generator' | 'solar' | 'battery';
type SldAdd =
  | { type: 'load'; loadKind: LoadKind; nameKey: string; defaults: Partial<CircuitInput> }
  | { type: 'subpanel' }
  | { type: 'source'; source: SourceKind };

/**
 * A load card: a typical connected size plus the standards-library cos φ and
 * demand factor for its kind — ONE source of truth with the circuit wizard and
 * table, so a "Sockets" circuit sizes identically (e.g. df 0.7, not 1.0)
 * no matter which entry point created it.
 */
function loadCard(kind: LoadKind, nameKey: string, extra: Partial<CircuitInput> = {}): SldAdd {
  return {
    type: 'load',
    loadKind: kind,
    nameKey,
    defaults: {
      cosPhi: LOAD_DEFAULTS[kind].cosPhi,
      demandFactor: LOAD_DEFAULTS[kind].demandFactor,
      ...(kind === 'lighting' ? { isLighting: true } : {}),
      ...extra,
    },
  };
}

const SLD_PALETTE: { key: string; labelKey: string; icon: React.ReactNode; action: SldAdd }[] = [
  { key: 'lighting', labelKey: 'vbuilder.lighting', icon: <IconBulb size={14} />, action: loadCard('lighting', 'vbuilder.lighting', { loadW: 1200 }) },
  { key: 'socket', labelKey: 'vbuilder.sockets', icon: <IconPlug size={14} />, action: loadCard('socket', 'vbuilder.sockets', { loadW: 2000 }) },
  { key: 'hvac', labelKey: 'vbuilder.hvac', icon: <IconAirConditioning size={14} />, action: loadCard('hvac', 'vbuilder.hvac', { loadW: 5500 }) },
  // Resistive water heater — hotels/apartments/restaurants; no-neutral when 3φ.
  { key: 'heating', labelKey: 'vbuilder.heating', icon: <IconFlame size={14} />, action: loadCard('heating', 'vbuilder.heating', { loadW: 2000 }) },
  { key: 'motor', labelKey: 'vbuilder.motor', icon: <IconEngine size={14} />, action: loadCard('motor', 'vbuilder.motor', { loadW: 0, motorKw: 5.5, starterType: 'DOL' }) },
  // Pumps split by supply phase: a small 1-ph booster vs a 3-ph transfer pump.
  { key: 'pump1', labelKey: 'vbuilder.pump1ph', icon: <IconDroplet size={14} />, action: loadCard('pump', 'vbuilder.pump1ph', { loadW: 0, motorKw: 0.75, starterType: 'DOL', phases: 1 }) },
  { key: 'pump3', labelKey: 'vbuilder.pump3ph', icon: <IconDroplet size={14} />, action: loadCard('pump', 'vbuilder.pump3ph', { loadW: 0, motorKw: 4, starterType: 'DOL', phases: 3 }) },
  // Life-safety: fire pump — no RCD, FRC cable, must ride the essential bus.
  { key: 'firepump', labelKey: 'vbuilder.firePump', icon: <IconFireHydrant size={14} />, action: loadCard('pump', 'vbuilder.firePump', { loadW: 0, motorKw: 15, starterType: 'DOL', startingDuty: 'heavy', lifeSafety: true }) },
  { key: 'ev', labelKey: 'vbuilder.ev', icon: <IconChargingPile size={14} />, action: loadCard('ev_charger', 'vbuilder.ev', { loadW: 7400 }) },
  // Industrial CEE-form 3φ socket: the 30 mA socket RCD rule still applies.
  { key: 'socket3', labelKey: 'vbuilder.socket3ph', icon: <IconPlugConnected size={14} />, action: loadCard('socket', 'vbuilder.socket3ph', { loadW: 7500, phases: 3 }) },
  // UPS / IT load — a non-linear (harmonic) source the power-quality pass flags.
  { key: 'ups', labelKey: 'vbuilder.ups', icon: <IconServer size={14} />, action: loadCard('ups', 'vbuilder.ups', { loadW: 3000 }) },
  // Custom/general loads with the phase stated outright — for the odd equipment
  // (kilns, lab gear, kitchen ranges…) the kind presets don't cover. Double-click
  // after dropping to set the real W / cos φ / demand factor.
  { key: 'general1', labelKey: 'vbuilder.general1ph', icon: <IconBolt size={14} />, action: loadCard('general', 'vbuilder.general1ph', { loadW: 2000, phases: 1 }) },
  { key: 'general3', labelKey: 'vbuilder.general3ph', icon: <IconBolt size={14} />, action: loadCard('general', 'vbuilder.general3ph', { loadW: 7500, phases: 3 }) },
  // A spare way: installed breaker, no load/cable — boards keep 20-30% spare.
  { key: 'spare', labelKey: 'vbuilder.spare', icon: <IconCircuitSwitchOpen size={14} />, action: loadCard('spare', 'vbuilder.spareName', { loadW: 0, lengthM: 1 }) },
  { key: 'subpanel', labelKey: 'vbuilder.subpanel', icon: <IconSitemap size={14} />, action: { type: 'subpanel' } },
];

/**
 * Energy-source cards: dropping one anywhere enables that source with the
 * shared defaults (it appears on the service head + the power one-line; tune
 * it on the Sources screen). PLN itself is not a card — the grid intake is
 * automatic on the service root — and the inverter is auto-sized within the
 * solar/battery designs, not placed by hand.
 */
const SOURCE_PALETTE: { key: SourceKind; labelKey: string; icon: React.ReactNode }[] = [
  { key: 'generator', labelKey: 'vbuilder.generator', icon: <IconEngine size={14} /> },
  { key: 'solar', labelKey: 'vbuilder.solar', icon: <IconSolarPanel size={14} /> },
  { key: 'battery', labelKey: 'vbuilder.battery', icon: <IconBattery2 size={14} /> },
];

/**
 * Unified building single-line: every panel on ONE canvas. Zoomed out, a panel
 * is a summary card (name + load); zoom in and it separates into a real internal
 * single-line drawn with IEC 60617 component symbols — incomer breaker → the
 * connection bus → L1/L2/L3 phase bars + sized N + PE earth bars, with a breaker
 * (+ RCD where required) per way, a contactor + thermal overload on starters, and
 * a load symbol (motor / lamp / socket / sub-board / load). The service-entrance
 * panel also shows its transformer / generator+ATS / meter and bus-tapped SPD and
 * capacitor bank, drawn only when the design actually has them.
 */

/* ----------------------------- schematic geometry -------------------------- */
const LEFT = 52; // gutter for the bar labels (L1/L2/L3/N/PE)
// Horizontal pitch per outgoing way / bus-tapped device. Wide enough that a
// way's breaker-rating + starter text and its drop-cable label ("4×50 mm² ·
// 68%") clear the neighbouring column — 76 px packed them illegibly.
const WAY_W = 108;
const RIGHT_PAD = 16;
const INCOMER_Y = 8;
const INCOMER_H = 26;
const BUS_TOP_Y = 92; // y of the first (L1) phase bar
const BAR_GAP = 13; // between phase bars — generous so the bus reads clearly
const NPE_GAP = 11; // gap before the N then PE bars
const BRK_GAP = 26; // bar block → breaker symbol
const BRK_H = 20;
const RCD_BAND = 15;
const STARTER_BAND = 28;
const LOAD_W = 70; // external load-node width (≤ WAY_W so siblings don't overlap)
const LOAD_NODE_H = 74; // approx external load-node height (for layout clearance)
// The panel card's chrome ABOVE the schematic SVG (title/badges header + card
// padding + the schematic's top margin), in the expanded/zoomed-in state. The
// `layout().height` only covers the SVG, so loads must clear schematic + chrome
// or they land inside the card once it expands on zoom-in.
const PANEL_CHROME = 64;
// Panel (expanded) bottom → its external load nodes. Tall enough that the drop-
// cable label sits clear of BOTH the feeder-outlet dot at the panel bottom and
// the load node below it.
const LOAD_DROP_GAP = 64;
const GRID_SRC_W = 158; // utility-supply (grid) node, drawn above a utility panel
const GRID_SRC_H = 54;
/** Layout grid: panels + loads snap to it so wiring stays legible. */
const GRID = 16;
const snap = (n: number) => Math.round(n / GRID) * GRID;

const FG = 'var(--mantine-color-text)';
const DIM = 'var(--mantine-color-dimmed)';
const PHASE_COLOR: Record<string, string> = {
  L1: '#c92a2a',
  L2: '#e8990c',
  L3: '#1971c2',
  L: '#c92a2a',
  N: '#4dabf7',
  PE: '#2f9e44',
};
/** PUIL/Indonesian R-S-T designation for the IEC phase keys. */
const PHASE_RST: Record<string, string> = { L1: 'R', L2: 'S', L3: 'T' };

/** Cable-loading colour: calm < 85%, tight 85–100% (orange), overloaded ≥ 100% (red). */
function utilColor(util: number): string {
  return util >= 100 ? 'var(--mantine-color-red-7)' : util >= 85 ? 'var(--mantine-color-orange-7)' : DIM;
}

interface SupplyHead {
  transformer?: string; // "630 kVA"
  generator?: boolean;
  ats?: boolean;
  /** Transfer arrangement: automatic (ATS) or manual changeover (COS). */
  transfer?: 'ats' | 'manual';
  meter?: string; // "kWh" or "CT 300/5"
  solar?: string; // "PV 40 kWp"
  battery?: string; // "Batt 20 kWh"
}
interface BusDevice {
  kind: 'spd' | 'cap';
  label: string;
  threePhase: boolean;
}

interface UnifiedWay {
  id: string;
  name: string;
  kind: LoadKind;
  phase: PhaseAssignment; // 'L1' | 'L2' | 'L3' | '3ph'
  breakerA: string;
  breakerClass: string; // 'MCB' | 'MCCB'
  rcd?: boolean;
  starter?: string; // motor-starter type, when controlled
  overload?: boolean; // thermal overload (contactor-based starters)
  cable: string; // "4×16 mm²"
  cableFull: string; // full make-up for the hover title
  util?: number; // cable loading %: load current ÷ derated ampacity
  orderCode?: string; // matched catalog SKU for the breaker (BOM-consistent)
  feeds?: string;
  warn: boolean;
}

interface UnifiedPanelData {
  panelId: string;
  name: string;
  tag?: string;
  source: string;
  system: string; // '1ph' | '3ph'
  loadKw: string;
  incomerA: string;
  incomer: string; // "MCCB 250A/4P"
  /** "400 V · 3φ" — shown on the zoomed-out summary. */
  voltage?: string;
  /** Per-phase line currents (A) for the summary's R/S/T strip. */
  phaseBalance?: { L1: number; L2: number; L3: number };
  busSpec: string;
  neutralSpec: string;
  peSpec: string;
  ways: UnifiedWay[];
  bus: BusDevice[]; // bus-tapped equipment (SPD / capacitor) — root panel
  supply?: SupplyHead; // service-entrance equipment — root panel
  /** A standalone root that is NOT the service entrance — i.e. not fed yet. */
  unfed?: boolean;
  /** Essential (genset-backed) panel — shown as a chip on the card. */
  essential?: boolean;
  /** UPS-backed (critical) panel — shown as a chip on the card. */
  critical?: boolean;
  /** Tenant kWh sub-meter label ("kWh" or "CT 150/5"), when fitted. */
  submeter?: string;
  feederIds: string[];
  issues?: NodeIssue[];
  /** Edit a specific way's circuit inline (double-click a component). */
  onEditCircuit?: (circuitId: string) => void;
  /** Right-click a component → replacement-parts menu at the cursor. */
  onContextCircuit?: (circuitId: string, x: number, y: number) => void;
  /** Add a way / sub-panel here (palette card dropped on this panel). */
  onAddItem?: (action: SldAdd) => void;
  /** Reorder the panel's ways (drag a component left/right). */
  onReorder?: (orderedCircuitIds: string[]) => void;
  [key: string]: unknown;
}

/* ------------------------------- IEC symbols ------------------------------- */
/* Each glyph draws around a vertical conductor at `cx`, starting at `top`. */

/** Circuit breaker: in-line conductor, open contact, thermal-magnetic box. */
function breaker(cx: number, top: number, color = FG) {
  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={top + 2} stroke={color} strokeWidth={1.2} />
      <circle cx={cx} cy={top + 2} r={1.4} fill={color} />
      <line x1={cx} y1={top + 2} x2={cx + 7} y2={top + 12} stroke={color} strokeWidth={1.3} />
      <circle cx={cx} cy={top + 16} r={1.2} fill={color} />
      <line x1={cx} y1={top + 16} x2={cx} y2={top + BRK_H} stroke={color} strokeWidth={1.2} />
      <rect x={cx + 4} y={top + 6} width={5} height={5} fill="none" stroke={color} strokeWidth={0.8} />
    </g>
  );
}

/** RCD/RCBO: the sensing toroid (ellipse) on the conductor + Δ. */
function rcd(cx: number, top: number) {
  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={top + 13} stroke={FG} strokeWidth={1.1} />
      <ellipse cx={cx} cy={top + 6} rx={5} ry={4} fill="none" stroke={PHASE_COLOR.PE} strokeWidth={1.1} />
      <text x={cx + 8} y={top + 9} fontSize={8} fontWeight={700} fill={PHASE_COLOR.PE}>
        Δ
      </text>
    </g>
  );
}

/** Contactor: open contact with the characteristic moving-contact arc. */
function contactor(cx: number, top: number) {
  return (
    <g>
      <circle cx={cx} cy={top} r={1.3} fill={FG} />
      <line x1={cx} y1={top} x2={cx + 6} y2={top + 9} stroke={FG} strokeWidth={1.2} />
      <path d={`M ${cx - 2} ${top + 12} A 4 4 0 0 1 ${cx + 6} ${top + 12}`} fill="none" stroke={FG} strokeWidth={1} />
      <circle cx={cx} cy={top + 12} r={1.1} fill={FG} />
    </g>
  );
}

/** Thermal overload relay: box with the heater bend. */
function overload(cx: number, top: number) {
  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={top + 2} stroke={FG} strokeWidth={1.1} />
      <rect x={cx - 5} y={top + 2} width={10} height={9} fill="none" stroke={FG} strokeWidth={1} />
      <path d={`M ${cx - 3} ${top + 9} L ${cx - 3} ${top + 5} L ${cx + 3} ${top + 5}`} fill="none" stroke={FG} strokeWidth={0.9} />
      <line x1={cx} y1={top + 11} x2={cx} y2={top + 13} stroke={FG} strokeWidth={1.1} />
    </g>
  );
}

/** Motor: circle + M, with the phase count. */
function motor(cx: number, top: number, threePhase: boolean) {
  return (
    <g>
      <circle cx={cx} cy={top + 11} r={9} fill="var(--mantine-color-body)" stroke={FG} strokeWidth={1} />
      <text x={cx} y={top + 14} fontSize={9} fontWeight={700} textAnchor="middle" fill={FG}>
        M
      </text>
      <text x={cx} y={top + 23} fontSize={6} textAnchor="middle" fill={DIM}>
        {threePhase ? '3~' : '1~'}
      </text>
    </g>
  );
}

/** Lamp (lighting): crossed circle. */
function lamp(cx: number, top: number) {
  const r = 7;
  const k = r * 0.7;
  return (
    <g>
      <circle cx={cx} cy={top + 9} r={r} fill="var(--mantine-color-body)" stroke={FG} strokeWidth={1} />
      <line x1={cx - k} y1={top + 9 - k} x2={cx + k} y2={top + 9 + k} stroke={FG} strokeWidth={1} />
      <line x1={cx - k} y1={top + 9 + k} x2={cx + k} y2={top + 9 - k} stroke={FG} strokeWidth={1} />
    </g>
  );
}

/** Socket outlet (IEC): semicircle + diameter line. */
function socket(cx: number, top: number) {
  return (
    <g>
      <path d={`M ${cx - 7} ${top + 6} A 7 7 0 0 0 ${cx + 7} ${top + 6}`} fill="none" stroke={FG} strokeWidth={1} />
      <line x1={cx - 7} y1={top + 6} x2={cx + 7} y2={top + 6} stroke={FG} strokeWidth={1} />
    </g>
  );
}

/** Sub-distribution board (feeder target). */
function board(cx: number, top: number) {
  const c = 'var(--mantine-color-indigo-5)';
  return (
    <g>
      <rect x={cx - 9} y={top} width={18} height={16} fill="var(--mantine-color-body)" stroke={c} strokeWidth={1.2} />
      <line x1={cx - 9} y1={top + 5} x2={cx + 9} y2={top + 5} stroke={c} strokeWidth={0.8} />
      <line x1={cx - 4} y1={top + 16} x2={cx - 4} y2={top + 11} stroke={c} strokeWidth={0.8} />
      <line x1={cx + 4} y1={top + 16} x2={cx + 4} y2={top + 11} stroke={c} strokeWidth={0.8} />
    </g>
  );
}

/** Generic load box. */
function loadBox(cx: number, top: number) {
  return <rect x={cx - 7} y={top + 2} width={14} height={13} fill="none" stroke={FG} strokeWidth={1} />;
}

/** SPD / surge arrester: box with diagonal arrow + earth. */
function spd(cx: number, top: number) {
  const g = PHASE_COLOR.PE;
  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={top + 2} stroke={FG} strokeWidth={1.1} />
      <rect x={cx - 5} y={top + 2} width={10} height={11} fill="none" stroke={FG} strokeWidth={1} />
      <line x1={cx - 3} y1={top + 11} x2={cx + 3} y2={top + 4} stroke={FG} strokeWidth={1} />
      <path d={`M ${cx + 3} ${top + 4} l -2.5 0 m 2.5 0 l 0 2.5`} stroke={FG} strokeWidth={1} fill="none" />
      <line x1={cx} y1={top + 13} x2={cx} y2={top + 16} stroke={g} strokeWidth={1.1} />
      <line x1={cx - 4} y1={top + 16} x2={cx + 4} y2={top + 16} stroke={g} strokeWidth={1.1} />
      <line x1={cx - 2.5} y1={top + 18} x2={cx + 2.5} y2={top + 18} stroke={g} strokeWidth={1} />
    </g>
  );
}

/** Capacitor (PFC bank): two parallel plates. */
function capacitor(cx: number, top: number) {
  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={top + 5} stroke={FG} strokeWidth={1.1} />
      <line x1={cx - 6} y1={top + 5} x2={cx + 6} y2={top + 5} stroke={FG} strokeWidth={1.3} />
      <line x1={cx - 6} y1={top + 8} x2={cx + 6} y2={top + 8} stroke={FG} strokeWidth={1.3} />
      <line x1={cx} y1={top + 8} x2={cx} y2={top + 13} stroke={FG} strokeWidth={1.1} />
    </g>
  );
}

/** Transformer: two coupled windings (overlapping circles). */
function transformer(cx: number, top: number) {
  return (
    <g>
      <circle cx={cx} cy={top + 7} r={6} fill="none" stroke={FG} strokeWidth={1} />
      <circle cx={cx} cy={top + 14} r={6} fill="none" stroke={FG} strokeWidth={1} />
    </g>
  );
}

/** Energy meter: circle with kWh. */
function meter(cx: number, top: number) {
  return (
    <g>
      <circle cx={cx} cy={top + 9} r={8} fill="var(--mantine-color-body)" stroke={FG} strokeWidth={1} />
      <text x={cx} y={top + 12} fontSize={6.5} fontWeight={700} textAnchor="middle" fill={FG}>
        kWh
      </text>
    </g>
  );
}

/** Generator: circle with G. */
function generator(cx: number, top: number) {
  return (
    <g>
      <circle cx={cx} cy={top + 9} r={9} fill="var(--mantine-color-body)" stroke="var(--mantine-color-orange-6)" strokeWidth={1.2} />
      <text x={cx} y={top + 12} fontSize={9} fontWeight={700} textAnchor="middle" fill="var(--mantine-color-orange-7)">
        G
      </text>
    </g>
  );
}

/** ATS changeover: a pivot selecting between two source contacts. */
function ats(cx: number, top: number) {
  const c = 'var(--mantine-color-red-6)';
  return (
    <g>
      <circle cx={cx} cy={top + 11} r={1.4} fill={c} />
      <line x1={cx} y1={top + 11} x2={cx - 6} y2={top + 3} stroke={c} strokeWidth={1.2} />
      <circle cx={cx - 6} cy={top + 2} r={1.2} fill={c} />
      <circle cx={cx + 6} cy={top + 2} r={1.2} fill={c} />
    </g>
  );
}

function loadSymbol(cx: number, top: number, w: UnifiedWay, threePhase: boolean) {
  if (w.feeds) return board(cx, top);
  switch (w.kind) {
    case 'motor':
    case 'pump':
      return motor(cx, top, threePhase);
    case 'lighting':
      return lamp(cx, top);
    case 'socket':
    case 'ev_charger':
      return socket(cx, top);
    default:
      return loadBox(cx, top);
  }
}

/* --------------------------- layout & schematic ---------------------------- */

function panelWidth(ways: number, busDevices: number): number {
  return Math.max(280, LEFT + Math.max(ways + busDevices, 1) * WAY_W + RIGHT_PAD);
}

function barLayout(threePhase: boolean): { key: string; y: number }[] {
  const out: { key: string; y: number }[] = [];
  const phases = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  phases.forEach((k, i) => out.push({ key: k, y: BUS_TOP_Y + i * BAR_GAP }));
  const nY = BUS_TOP_Y + phases.length * BAR_GAP + NPE_GAP;
  out.push({ key: 'N', y: nY });
  out.push({ key: 'PE', y: nY + NPE_GAP });
  return out;
}

interface Layout {
  bars: { key: string; y: number }[];
  brkTop: number;
  rcdTop?: number;
  starterTop?: number;
  /** Where each way's outgoing terminal sits (the panel's output to the load). */
  outY: number;
  height: number;
}

/** Vertical layout — RCD / starter bands are reserved only when the panel uses
 * them. The panel ends at the MCB/starter output terminal; the LOAD itself is a
 * separate node wired to that terminal, so loads live outside the panel. */
function layout(threePhase: boolean, hasRcd: boolean, hasStarter: boolean): Layout {
  const bars = barLayout(threePhase);
  const brkTop = bars[bars.length - 1]!.y + BRK_GAP;
  let y = brkTop + BRK_H;
  let rcdTop: number | undefined;
  if (hasRcd) {
    rcdTop = y + 4;
    y = rcdTop + RCD_BAND;
  }
  let starterTop: number | undefined;
  if (hasStarter) {
    starterTop = y + 4;
    y = starterTop + STARTER_BAND;
  }
  const outY = y + 12;
  // Height must clear the output-terminal amp label drawn at outY + 11 (~outY + 14
  // with the glyph descenders), else the bottom row of labels gets clipped.
  return { bars, brkTop, rcdTop, starterTop, outY, height: outY + 18 };
}

function PanelSchematic({ d, width }: { d: UnifiedPanelData; width: number }) {
  const threePhase = d.system === '3ph';
  const hasRcd = d.ways.some((w) => w.rcd);
  const hasStarter = d.ways.some((w) => w.starter);
  const L = layout(threePhase, hasRcd, hasStarter);
  const barY = (k: string) => L.bars.find((b) => b.key === k)?.y ?? BUS_TOP_Y;
  const phaseKeys = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  const right = width - RIGHT_PAD;
  const tailX = LEFT + 16;
  const colX = (i: number) => LEFT + i * WAY_W + WAY_W / 2;

  // Drag a way (component column) left/right to reorder it within the panel.
  // Pointer-based (HTML5 DnD is unreliable on SVG); the column follows the cursor
  // in SVG units (screen px ÷ zoom) and snaps to a new slot on release.
  const { zoom } = useViewport();
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const [hoverWay, setHoverWay] = useState<string | null>(null); // highlight the hovered, selectable way
  const dragRef = useRef({ from: 0, startX: 0, dx: 0 });
  const liveRef = useRef({ ways: d.ways, onReorder: d.onReorder, zoom });
  liveRef.current = { ways: d.ways, onReorder: d.onReorder, zoom };

  const startWayDrag = (e: React.PointerEvent, index: number, id: string) => {
    if (e.button !== 0) return; // left-button only
    e.stopPropagation(); // don't start a React Flow node drag
    dragRef.current = { from: index, startX: e.clientX, dx: 0 };
    setDrag({ id, dx: 0 });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - dragRef.current.startX) / (liveRef.current.zoom || 1);
      dragRef.current.dx = dx;
      setDrag((cur) => (cur ? { ...cur, dx } : cur));
    };
    const up = () => {
      const { ways, onReorder } = liveRef.current;
      const to = dropIndex(dragRef.current.from, dragRef.current.dx, WAY_W, ways.length);
      if (to !== dragRef.current.from) onReorder?.(reorderIds(ways.map((w) => w.id), dragRef.current.from, to));
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag?.id]);

  const supplyHead = () => {
    if (!d.supply) return null;
    let sx = LEFT + 176;
    const items: React.ReactNode[] = [];
    const place = (glyph: React.ReactNode, label: string, step = 50) => {
      items.push(
        <g key={label}>
          {glyph}
          <text x={sx} y={INCOMER_Y + 34} fontSize={7} textAnchor="middle" fill={DIM}>
            {label}
          </text>
        </g>,
      );
      sx += step;
    };
    if (d.supply.transformer) place(transformer(sx, INCOMER_Y), d.supply.transformer);
    if (d.supply.generator) place(generator(sx, INCOMER_Y), 'Genset');
    if (d.supply.ats) place(ats(sx, INCOMER_Y), 'ATS', 42);
    if (d.supply.meter) place(meter(sx, INCOMER_Y), d.supply.meter);
    return (
      <g>
        <line x1={LEFT + 150} y1={INCOMER_Y + 13} x2={LEFT + 170} y2={INCOMER_Y + 13} stroke={DIM} strokeWidth={1} />
        {items}
      </g>
    );
  };

  return (
    <svg width={width} height={L.height} style={{ display: 'block' }}>
      <defs>
        <filter id="sldBarShadow" x="-1%" y="-60%" width="102%" height="220%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.7" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>
      {supplyHead()}

      {/* Incomer + main breaker on the connection bus */}
      <rect x={LEFT} y={INCOMER_Y} width={148} height={INCOMER_H} rx={4} fill="var(--mantine-color-indigo-light)" stroke="var(--mantine-color-indigo-5)" />
      <text x={LEFT + 8} y={INCOMER_Y + 17} fontSize={10} fontWeight={700} fill={FG}>
        {d.incomer}
      </text>
      <line x1={tailX} y1={INCOMER_Y + INCOMER_H} x2={tailX} y2={barY('N')} stroke={DIM} strokeWidth={2} />
      {breaker(tailX, INCOMER_Y + INCOMER_H + 6, 'var(--mantine-color-indigo-6)')}
      <text x={tailX + 12} y={INCOMER_Y + INCOMER_H + 20} fontSize={8.5} fill={DIM}>
        bus: {d.busSpec}
      </text>

      {/* Phase / N / PE bars — drawn as rounded copper rails with a soft sheen and
          shadow for depth, a coloured label pill, and the N/PE sized section. */}
      {L.bars.map((b) => {
        const color = PHASE_COLOR[b.key] ?? '#888';
        const h = b.key === 'PE' ? 4 : b.key === 'N' ? 5 : 6;
        const w = right - LEFT;
        // Phase bars use the PUIL/Indonesian R-S-T designation (N/PE unchanged).
        const label = PHASE_RST[b.key] ?? b.key;
        return (
          <g key={b.key}>
            <rect x={3} y={b.y - 6} width={LEFT - 12} height={12} rx={6} fill={color} />
            <text x={3 + (LEFT - 12) / 2} y={b.y + 3} fontSize={9} fontWeight={700} textAnchor="middle" fill="#fff">
              {label}
            </text>
            <rect x={LEFT} y={b.y - h / 2} width={w} height={h} rx={h / 2} fill={color} filter="url(#sldBarShadow)" />
            <rect x={LEFT + 2} y={b.y - h / 2 + 0.6} width={w - 4} height={1.1} rx={0.5} fill="#fff" opacity={0.45} />
            {b.key === 'N' && (
              <text x={right - 2} y={b.y - 6} fontSize={7.5} fontWeight={600} textAnchor="end" fill={color}>
                {d.neutralSpec}
              </text>
            )}
            {b.key === 'PE' && (
              <text x={right - 2} y={b.y - 6} fontSize={7.5} fontWeight={600} textAnchor="end" fill={color}>
                {d.peSpec}
              </text>
            )}
          </g>
        );
      })}

      {/* One column per outgoing way */}
      {d.ways.map((w, i) => {
        const cx = colX(i);
        const taps = w.phase === '3ph' ? phaseKeys : [w.phase];
        // Colour the live run by its phase so each circuit reads clearly: a
        // single-phase way takes its R/S/T (L1/L2/L3) colour; a 3-phase way's
        // post-breaker conductor stays neutral (it bundles all three taps above).
        const runColor = w.phase === '3ph' ? FG : PHASE_COLOR[w.phase] ?? FG;
        const dragging = drag?.id === w.id;
        return (
          <g
            key={w.id}
            className="nodrag"
            style={{ cursor: 'grab', opacity: dragging ? 0.65 : 1 }}
            transform={dragging ? `translate(${drag.dx} 0)` : undefined}
            onPointerEnter={() => setHoverWay(w.id)}
            onPointerLeave={() => setHoverWay((h) => (h === w.id ? null : h))}
            // Drag the column to reorder; a click/double-click won't move enough
            // to trigger a slot change.
            onPointerDown={(e) => startWayDrag(e, i, w.id)}
            onDoubleClick={(e) => {
              // Edit this circuit inline; don't let it bubble to the panel-level
              // double-click (which opens the panel inspector).
              e.stopPropagation();
              d.onEditCircuit?.(w.id);
            }}
            onContextMenu={(e) => {
              // Right-click → appropriate replacement parts at the cursor.
              e.preventDefault();
              e.stopPropagation();
              d.onContextCircuit?.(w.id, e.clientX, e.clientY);
            }}
          >
            <title>{`${w.name} — ${w.breakerClass} ${w.breakerA}${w.rcd ? ' + RCD' : ''}${w.starter ? ` · ${w.starter}` : ''}${w.orderCode ? ` · ${w.orderCode}` : ''} — double-click to edit`}</title>
            {/* Hover highlight: signals this MCB is selectable / editable. */}
            {hoverWay === w.id && !dragging && (
              <rect
                x={cx - WAY_W / 2 + 5}
                y={L.brkTop - 9}
                width={WAY_W - 10}
                height={L.outY - L.brkTop + 14}
                rx={6}
                fill="var(--mantine-color-indigo-5)"
                fillOpacity={0.1}
                stroke="var(--mantine-color-indigo-4)"
                strokeOpacity={0.55}
                strokeWidth={1}
              />
            )}
            {taps.map((k, j) => {
              const ox = cx + (taps.length > 1 ? (j - 1) * 5 : 0);
              return <line key={k} x1={ox} y1={barY(k)} x2={ox} y2={L.brkTop} stroke={PHASE_COLOR[k] ?? '#888'} strokeWidth={1.8} />;
            })}
            {w.phase !== '3ph' && (
              <line x1={cx + 8} y1={barY('N')} x2={cx + 8} y2={L.outY} stroke={PHASE_COLOR.N} strokeWidth={1.5} strokeDasharray="4 2" />
            )}
            <line x1={cx + 12} y1={barY('PE')} x2={cx + 12} y2={L.outY} stroke={PHASE_COLOR.PE} strokeWidth={1.5} strokeDasharray="4 2" />
            <line x1={cx} y1={L.brkTop + BRK_H} x2={cx} y2={L.outY} stroke={runColor} strokeWidth={1.8} />
            {breaker(cx, L.brkTop, w.warn ? 'var(--mantine-color-red-6)' : FG)}
            <text x={cx + 9} y={L.brkTop + 13} fontSize={8} fill={DIM}>
              {w.breakerA}
            </text>
            {L.rcdTop !== undefined && w.rcd && rcd(cx, L.rcdTop)}
            {L.starterTop !== undefined && w.starter && contactor(cx, L.starterTop)}
            {L.starterTop !== undefined && w.starter && w.overload && overload(cx, L.starterTop + 14)}
            {L.starterTop !== undefined && w.starter && (
              <text x={cx + 9} y={L.starterTop + 9} fontSize={7} fill={DIM}>
                {w.starter.replace('_', '-')}
              </text>
            )}
            {/* Output terminal — the LOAD is a separate node wired to here. */}
            <circle cx={cx} cy={L.outY} r={2.4} fill={runColor} />
            <text x={cx} y={L.outY + 11} fontSize={6.5} textAnchor="middle" fill={DIM}>
              {w.breakerA}
            </text>
          </g>
        );
      })}

      {/* Bus-tapped equipment: SPD / capacitor bank (root panel) */}
      {d.bus.map((dev, e) => {
        const cx = colX(d.ways.length + e);
        const taps = dev.threePhase ? phaseKeys : ['L1'];
        return (
          <g key={`${dev.kind}-${e}`}>
            {taps.map((k, j) => {
              const ox = cx + (taps.length > 1 ? (j - 1) * 5 : 0);
              return <line key={k} x1={ox} y1={barY(k)} x2={ox} y2={L.brkTop} stroke={PHASE_COLOR[k] ?? '#888'} strokeWidth={1.4} />;
            })}
            {dev.kind === 'spd' ? spd(cx, L.brkTop) : capacitor(cx, L.brkTop)}
            <text x={cx} y={L.brkTop + 30} fontSize={7.5} fontWeight={600} textAnchor="middle" fill={DIM}>
              {dev.kind === 'spd' ? 'SPD' : 'PFC'}
            </text>
            <text x={cx} y={L.brkTop + 39} fontSize={7} textAnchor="middle" fill={DIM}>
              {dev.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Selection ring: an unmistakable halo on any node React Flow has selected. */
const SELECT_RING = '0 0 0 3px var(--mantine-color-indigo-4)';

/**
 * Visible resize grip on the palette's right edge: a grip bar you can see and
 * grab (the previous invisible hover strip was undiscoverable). Drag to
 * resize; double-click to snap back to the fit-everything width.
 */
function PaletteGrip({
  onPointerDown,
  onDoubleClick,
  title,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  title: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Box
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        position: 'absolute',
        top: 0,
        right: -7,
        width: 14,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        style={{
          width: 4,
          height: 48,
          borderRadius: 2,
          background: hover ? 'var(--mantine-color-indigo-5)' : 'var(--mantine-color-default-border)',
          transition: 'background 120ms ease',
        }}
      />
    </Box>
  );
}

/** One labelled value in the zoomed-out panel summary. */
function SummaryStat({ v, k, big }: { v: string; k: string; big?: boolean }) {
  return (
    <Box style={{ minWidth: 0 }}>
      <Text size={big ? 'lg' : 'sm'} fw={700} lineClamp={1}>
        {v}
      </Text>
      <Text c="dimmed" tt="uppercase" style={{ fontSize: 9, letterSpacing: '0.04em' }} lineClamp={1}>
        {k}
      </Text>
    </Box>
  );
}

/**
 * Zoomed-out panel summary: the at-a-glance facts an engineer scans a board
 * for — load/demand, the incomer device spec, system, ways (+spares) and the
 * R/S/T phase loading — plus a miniature bus strip whose way stubs sit at the
 * SAME x positions as the detail schematic's columns, so the zoom
 * cross-dissolve lines up and the card still reads as a board.
 */
function PanelSummary({ d, width, height }: { d: UnifiedPanelData; width: number; height: number }) {
  const { t } = useTranslation();
  const spares = d.ways.filter((w) => w.kind === 'spare').length;
  const pb = d.phaseBalance;
  const colX = (i: number) => LEFT + i * WAY_W + WAY_W / 2;

  return (
    <Stack gap={6} justify="space-between" style={{ height }} py={6}>
      <Group gap={18} wrap="wrap" align="flex-start">
        <SummaryStat big v={d.loadKw} k={t('sldSummary.load')} />
        <SummaryStat v={d.incomerA} k={t('sldSummary.demand')} />
        <SummaryStat v={d.incomer} k={t('sldSummary.incomer')} />
        {d.voltage && <SummaryStat v={d.voltage} k={t('sldSummary.system')} />}
        <SummaryStat
          v={
            spares > 0
              ? t('sldSummary.waysWithSpares', { count: d.ways.length, spares })
              : String(d.ways.length)
          }
          k={t('sldSummary.ways')}
        />
        {d.busSpec && <SummaryStat v={d.busSpec} k={t('sldSummary.busbar')} />}
      </Group>

      {pb && d.system === '3ph' && (
        <Group gap={14} wrap="nowrap">
          {([
            ['R', 'L1', pb.L1],
            ['S', 'L2', pb.L2],
            ['T', 'L3', pb.L3],
          ] as const).map(([label, key, amps]) => (
            <Group key={key} gap={5} wrap="nowrap">
              <Box
                w={14}
                h={14}
                style={{
                  borderRadius: 4,
                  background: PHASE_COLOR[key],
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {label}
              </Box>
              <Text size="xs" fw={600}>
                {formatAmps(amps)}
              </Text>
            </Group>
          ))}
        </Group>
      )}

      {/* Miniature bus: a stub per way at its true column x — phase-coloured,
          dashed for spares, a board marker for feeders, rating beneath. */}
      <svg width={width} height={38} style={{ display: 'block', overflow: 'hidden' }}>
        <line
          x1={LEFT - 26}
          y1={6}
          x2={Math.min(colX(Math.max(d.ways.length - 1, 0)) + 26, width - 2)}
          y2={6}
          stroke={FG}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.75}
        />
        {d.ways.map((w, i) => {
          const x = colX(i);
          if (x > width - 6) return null;
          const color = w.feeds
            ? 'var(--mantine-color-indigo-4)'
            : (PHASE_COLOR[w.phase] ?? 'var(--mantine-color-gray-5)');
          const hot = w.util !== undefined && w.util >= 100;
          const warm = w.util !== undefined && w.util >= 85;
          return (
            <g key={w.id}>
              <line
                x1={x}
                y1={6}
                x2={x}
                y2={20}
                stroke={color}
                strokeWidth={2.4}
                strokeDasharray={w.kind === 'spare' ? '2.5 2.5' : undefined}
              />
              {w.feeds && <rect x={x - 4} y={16} width={8} height={7} fill="none" stroke={color} strokeWidth={1.4} />}
              <text
                x={x}
                y={33}
                fontSize={9}
                textAnchor="middle"
                fontWeight={600}
                fill={hot ? 'var(--mantine-color-red-6)' : warm ? 'var(--mantine-color-orange-6)' : DIM}
              >
                {w.breakerA}
              </text>
            </g>
          );
        })}
      </svg>
    </Stack>
  );
}

/** A panel that renders summary-or-detail from the current viewport zoom. */
function UnifiedPanelNode({ data, selected }: NodeProps) {
  const d = data as UnifiedPanelData;
  const { t } = useTranslation();
  const { zoom } = useViewport();
  const expanded = zoom >= 0.72;
  const width = panelWidth(d.ways.length, d.bus.length);
  // Reserve the expanded schematic height even in the summary, so the card is a
  // STABLE size at every zoom. Otherwise the card grows on zoom-in and its loads
  // (placed below the expanded bottom) float far away when zoomed out.
  const schematicH = layout(d.system === '3ph', d.ways.some((w) => w.rcd), d.ways.some((w) => w.starter)).height;
  const hasError = (d.issues ?? []).some((i) => i.severity === 'error');
  const [hover, setHover] = useState(false); // highlight the draggable/selectable panel on hover
  // Panel health: the worst cable loading + how many ways are overloaded — shown
  // as a badge so problem panels stand out while zoomed out.
  const utils = d.ways.map((w) => w.util).filter((u): u is number => u !== undefined);
  const worstUtil = utils.length ? Math.max(...utils) : undefined;
  const overloaded = utils.filter((u) => u >= 100).length;

  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width,
        background: 'var(--mantine-color-body)',
        border: `1px solid ${
          hasError
            ? 'var(--mantine-color-red-5)'
            : selected || hover
              ? 'var(--mantine-color-indigo-5)'
              : 'var(--mantine-color-default-border)'
        }`,
        borderRadius: 'var(--mantine-radius-md)',
        // The selection ring stacks UNDER the hover shadow so both read at once
        // — a selected panel is unambiguous (it's what Ctrl+C will copy).
        boxShadow: selected
          ? `${SELECT_RING}, var(--mantine-shadow-md)`
          : hover
            ? 'var(--mantine-shadow-md)'
            : 'var(--mantine-shadow-sm)',
        padding: 10,
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(SLD_DND)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(SLD_DND);
        if (!raw) return;
        e.preventDefault();
        // Handled here — don't also fire the canvas-level "new panel" drop.
        e.stopPropagation();
        try {
          d.onAddItem?.(JSON.parse(raw) as SldAdd);
        } catch {
          /* malformed payload — ignore */
        }
      }}
    >
      <Handle type="target" position={Position.Top} id="in" />

      <Group justify="space-between" wrap="nowrap" gap={6} align="flex-start">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconPlugConnected size={16} color="var(--mantine-color-indigo-5)" style={{ flexShrink: 0 }} />
          <Box style={{ minWidth: 0 }}>
            {d.tag && (
              <Text size="xs" fw={700} c="indigo.6" ff="monospace" lineClamp={1}>
                {d.tag}
              </Text>
            )}
            <Text size="sm" fw={700} lineClamp={1} title={d.name}>
              {d.name}
            </Text>
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap">
          {worstUtil !== undefined && (
            <Badge
              size="xs"
              variant={overloaded > 0 ? 'filled' : 'light'}
              color={overloaded > 0 ? 'red' : worstUtil >= 85 ? 'orange' : 'gray'}
              title="Worst cable loading in this panel"
            >
              {overloaded > 0 ? `${overloaded} over` : `${worstUtil}%`}
            </Badge>
          )}
          <NodeIssues issues={d.issues} />
          {d.essential && (
            <Badge size="xs" variant="light" color="yellow" title={t('sldNode.essentialHint')}>
              {t('sldNode.essential')}
            </Badge>
          )}
          {d.critical && (
            <Badge size="xs" variant="light" color="grape" title={t('sldNode.criticalHint')}>
              {t('sldNode.critical')}
            </Badge>
          )}
          {d.submeter && (
            <Badge size="xs" variant="light" color="cyan" title={t('sldNode.submeterHint')}>
              {d.submeter}
            </Badge>
          )}
          <Badge
            size="xs"
            variant="light"
            color={d.unfed ? 'orange' : d.source === 'utility' ? 'indigo' : 'gray'}
            title={d.unfed ? t('sldNode.unfedHint') : undefined}
          >
            {d.unfed
              ? t('sldNode.unfed')
              : d.source === 'utility'
                ? t('sldNode.supply')
                : t('sldNode.fed')}
          </Badge>
        </Group>
      </Group>

      {/* Keyed so the view remounts when the LOD flips — the sld-lod-enter
          animation then cross-dissolves summary ⇄ detail instead of snapping.
          minHeight reserves the schematic's footprint so the card is the same
          size summary-or-detail: its loads then sit a fixed gap below at any zoom. */}
      <Box
        key={expanded ? 'detail' : 'summary'}
        className="sld-lod-enter"
        style={{ minHeight: schematicH + 4 }}
      >
        {!expanded ? (
          <PanelSummary d={d} width={width - 20} height={schematicH + 4} />
        ) : (
          <Box mt={4} style={{ overflow: 'hidden' }}>
            <PanelSchematic d={d} width={width - 20} />
          </Box>
        )}
      </Box>

      {/* A source anchor per way at its MCB column — feeder edges go to sub-panels,
          load edges go to the external load node. Not for starting new connections. */}
      {d.ways.map((w, i) => {
        const left = LEFT + i * WAY_W + WAY_W / 2;
        return <Handle key={w.id} type="source" id={w.id} position={Position.Bottom} style={{ left }} isConnectable={false} />;
      })}
      {/* Outlet: drag from here onto another panel to feed it (creates the feeder).
          Big + low so it's an easy target. */}
      <Handle
        type="source"
        id="out"
        position={Position.Bottom}
        title="Drag to another panel to feed it"
        style={{
          left: '50%',
          bottom: -14,
          width: 26,
          height: 26,
          borderRadius: 13,
          background: 'var(--mantine-color-indigo-5)',
          border: '3px solid var(--mantine-color-body)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          cursor: 'crosshair',
        }}
      />
    </Box>
  );
}

/** External load node: the load hangs OUTSIDE the panel, wired to its MCB. */
interface LoadNodeData {
  kind: LoadKind;
  name: string;
  breakerA: string;
  cable: string;
  util?: number;
  phase: PhaseAssignment;
  threePhase: boolean;
  warn: boolean;
  orderCode?: string;
  /** Owning panel + this load's circuit id — so Delete removes the circuit. */
  panelId: string;
  circuitId: string;
  onEdit?: () => void;
  onContext?: (x: number, y: number) => void;
  [key: string]: unknown;
}

function LoadNode({ data, selected }: NodeProps) {
  const d = data as LoadNodeData;
  const [hover, setHover] = useState(false);
  // loadSymbol() only reads .kind/.feeds — give it a minimal way-shaped object.
  const symW = { kind: d.kind, feeds: undefined } as unknown as UnifiedWay;
  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => d.onEdit?.()}
      title={`${d.name} — ${d.breakerA} · ${d.cable}${d.orderCode ? ` · ${d.orderCode}` : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        d.onContext?.(e.clientX, e.clientY);
      }}
      style={{
        width: LOAD_W,
        background: 'var(--mantine-color-body)',
        border: `1px solid ${d.warn ? 'var(--mantine-color-red-5)' : selected || hover ? 'var(--mantine-color-indigo-5)' : 'var(--mantine-color-default-border)'}`,
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: selected
          ? `${SELECT_RING}, var(--mantine-shadow-md)`
          : hover
            ? 'var(--mantine-shadow-md)'
            : 'var(--mantine-shadow-xs)',
        padding: 5,
        cursor: 'pointer',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
      }}
    >
      <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      <svg width={LOAD_W - 12} height={30} style={{ display: 'block', margin: '0 auto' }}>
        <line x1={(LOAD_W - 12) / 2} y1={0} x2={(LOAD_W - 12) / 2} y2={6} stroke={PHASE_COLOR[d.phase] ?? FG} strokeWidth={1.6} />
        {loadSymbol((LOAD_W - 12) / 2, 8, symW, d.threePhase)}
      </svg>
      <Text size="9px" fw={700} ta="center" lineClamp={1} title={d.name}>
        {d.name}
      </Text>
      <Text
        size="9px"
        ta="center"
        lineClamp={1}
        style={{ color: d.util !== undefined ? utilColor(d.util) : 'var(--mantine-color-dimmed)' }}
      >
        {/* Cable size sits on the drop line; the node keeps the protection + loading. */}
        {d.breakerA}
        {d.util !== undefined ? ` · ${d.util}%` : ''}
      </Text>
    </Box>
  );
}

/** A load on the canvas, not yet wired to a panel — drag its outlet to a panel. */
function FloatLoadNode({ data, selected }: NodeProps) {
  const d = data as { kind: LoadKind; name: string; loadW: number };
  const [hover, setHover] = useState(false);
  const symW = { kind: d.kind, feeds: undefined } as unknown as UnifiedWay;
  const kw = d.loadW >= 1000 ? `${(d.loadW / 1000).toFixed(1)} kW` : `${d.loadW} W`;
  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag onto the nearest panel to wire it automatically (creates the MCB), or drag the dot to a specific panel"
      style={{
        width: LOAD_W + 8,
        background: 'var(--mantine-color-body)',
        border: `1.5px dashed ${selected || hover ? 'var(--mantine-color-indigo-5)' : 'var(--mantine-color-orange-5)'}`,
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: selected
          ? `${SELECT_RING}, var(--mantine-shadow-md)`
          : hover
            ? 'var(--mantine-shadow-md)'
            : 'var(--mantine-shadow-xs)',
        padding: 5,
        cursor: 'grab',
      }}
    >
      {/* Outlet at the TOP: drag up to a panel to connect (panel feeds the load). */}
      <Handle
        type="source"
        id="out"
        position={Position.Top}
        style={{ width: 16, height: 16, background: 'var(--mantine-color-orange-5)', border: '2px solid var(--mantine-color-body)' }}
      />
      <svg width={LOAD_W - 4} height={30} style={{ display: 'block', margin: '0 auto' }}>
        {loadSymbol((LOAD_W - 4) / 2, 8, symW, false)}
      </svg>
      <Text size="9px" fw={700} ta="center" lineClamp={1} title={d.name}>
        {d.name}
      </Text>
      <Text size="9px" c="orange.6" ta="center" lineClamp={1}>
        {kw} · unwired
      </Text>
    </Box>
  );
}

/** The incoming utility (PLN grid) supply drawn above a utility-fed panel. */
interface GridSourceData {
  supplyType: 'LV' | 'MV';
  voltage: string; // "400 V" or "20 kV"
  transformer?: string; // "630 kVA" — shown when fed at MV
  meter?: string; // "kWh" or "CT 300/5"
  generator?: boolean;
  transfer?: 'ats' | 'manual';
  solar?: string; // "PV 40 kWp"
  battery?: string; // "Batt 20 kWh"
  [key: string]: unknown;
}

function GridSourceNode({ data }: NodeProps) {
  const d = data as GridSourceData;
  const { t } = useTranslation();
  return (
    <Box
      style={{
        width: GRID_SRC_W,
        background: 'var(--mantine-color-body)',
        border: '1.5px solid var(--mantine-color-indigo-4)',
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: 'var(--mantine-shadow-xs)',
        padding: '6px 8px',
      }}
    >
      <Group gap={6} wrap="nowrap" align="center">
        {/* IEC utility-network symbol: a circle struck through (the grid source). */}
        <svg width={22} height={22} style={{ flexShrink: 0 }}>
          <circle cx={11} cy={11} r={9} fill="none" stroke={PHASE_COLOR.L1} strokeWidth={1.6} />
          <line x1={5} y1={15} x2={17} y2={7} stroke={PHASE_COLOR.L1} strokeWidth={1.4} />
        </svg>
        <Box style={{ minWidth: 0 }}>
          <Text size="xs" fw={700} lineClamp={1}>
            {t('system.gridSupply')}
          </Text>
          <Text style={{ fontSize: 9 }} c="dimmed" lineClamp={1}>
            {d.supplyType === 'MV' ? t('system.supplyMv') : t('system.supplyLv')} · {d.voltage}
            {d.transformer ? ` → ${d.transformer}` : ''}
          </Text>
        </Box>
      </Group>
      {/* Revenue meter stays on the intake; generator/solar/battery are now
          their own external source nodes beside this one. */}
      {d.meter && (
        <Group gap={4} mt={3} wrap="wrap">
          <Badge size="xs" variant="light" color="indigo">
            {d.meter}
          </Badge>
        </Group>
      )}
      {/* Feeds down into the panel's incomer ('in' target). Display-only. */}
      <Handle type="source" id="out" position={Position.Bottom} isConnectable={false} />
    </Box>
  );
}

/** An energy source (generator / solar / battery) drawn as its own node. */
interface SourceNodeData {
  kind: 'generator' | 'solar' | 'battery';
  sub: string;
  badge?: string; // e.g. "ATS" / "COS" on the generator
  [key: string]: unknown;
}

const SOURCE_NODE_STYLE: Record<SourceNodeData['kind'], { color: string; icon: React.ReactNode }> = {
  generator: { color: 'var(--mantine-color-orange-4)', icon: <IconEngine size={18} /> },
  solar: { color: 'var(--mantine-color-teal-4)', icon: <IconSolarPanel size={18} /> },
  battery: { color: 'var(--mantine-color-grape-4)', icon: <IconBattery2 size={18} /> },
};

function SourceNode({ data, selected }: NodeProps) {
  const d = data as SourceNodeData;
  const { t } = useTranslation();
  const s = SOURCE_NODE_STYLE[d.kind];
  return (
    <Box
      style={{
        width: GRID_SRC_W,
        background: 'var(--mantine-color-body)',
        border: `1.5px solid ${s.color}`,
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: selected ? `${SELECT_RING}, var(--mantine-shadow-xs)` : 'var(--mantine-shadow-xs)',
        padding: '6px 8px',
      }}
    >
      <Group gap={6} wrap="nowrap" align="center">
        <ThemeIcon size="md" variant="light" color={s.color} style={{ flexShrink: 0 }}>
          {s.icon}
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Group gap={5} wrap="nowrap">
            <Text size="xs" fw={700} lineClamp={1}>
              {t(`vbuilder.${d.kind}`)}
            </Text>
            {d.badge && (
              <Badge size="xs" variant="light" color={s.color}>
                {d.badge}
              </Badge>
            )}
          </Group>
          <Text style={{ fontSize: 9 }} c="dimmed" lineClamp={1}>
            {d.sub}
          </Text>
        </Box>
      </Group>
      {/* Feeds down into the main bus ('in' target on the service panel). */}
      <Handle type="source" id="out" position={Position.Bottom} isConnectable={false} />
    </Box>
  );
}

const UNIFIED_NODE_TYPES = { uPanel: UnifiedPanelNode, load: LoadNode, floatLoad: FloatLoadNode, grid: GridSourceNode, source: SourceNode };

/**
 * Feeder edge between panels. Sibling feeders from the same parent share a
 * mid-height, so their horizontal runs (and labels) overlap. `data.offset`
 * staggers each sibling's centre line so the cables and labels separate out.
 */
function FeederEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data,
}: EdgeProps) {
  const offset = (data?.offset as number | undefined) ?? 0;
  const label = data?.label as string | undefined;
  const util = data?.util as number | undefined;
  // Colour the label by cable loading: ≥100% overloaded (red), ≥85% tight (orange).
  const color =
    util === undefined ? undefined : util >= 100 ? 'var(--mantine-color-red-7)' : util >= 85 ? 'var(--mantine-color-orange-7)' : undefined;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    centerY: (sourceY + targetY) / 2 + offset,
    borderRadius: 8,
  });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} interactionWidth={24} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            title="Double-click to edit this feeder cable (length, size)"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--mantine-color-body)',
              padding: '1px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              ...(color ? { color } : {}),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const UNIFIED_EDGE_TYPES = { feeder: FeederEdge };

/**
 * The cable make-up without its construction type: "NYY 4×50 + 25 mm²" →
 * "4×50 + 25 mm²" (a leading "2× " parallel-run prefix is kept). Labels reuse
 * the engine's grouped spec so a reduced PE shows truthfully ("35 + 16 mm²"),
 * instead of the old cores×csa shorthand that hid it ("2×35 mm²").
 */
function makeupOnly(cableSpec: string): string {
  return cableSpec.replace(/^(\d+× )?\S+ /, '$1');
}

const THERMAL_OVERLOAD_STARTERS = new Set(['DOL', 'STAR_DELTA', 'REVERSING', 'PUMP']);

function buildUnified(
  project: ProjectInput,
  system: SystemResult,
  onEditCircuit: (panelId: string, circuitId: string) => void,
  onAddItem: (panelId: string, action: SldAdd) => void,
  onContextCircuit: (panelId: string, circuitId: string, x: number, y: number) => void,
  onReorder: (panelId: string, orderedCircuitIds: string[]) => void,
  floatingLoads: FloatingLoad[],
  parts: Part[],
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  const parentOf = new Map<string, string>();
  const feederWayToChild = new Map<string, string>();
  for (const p of project.panels) {
    for (const c of p.circuits) {
      if (c.feedsPanelId) {
        parentOf.set(c.feedsPanelId, p.id);
        feederWayToChild.set(c.id, c.feedsPanelId);
      }
    }
  }

  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const parent = parentOf.get(id);
    const dd = parent ? depthOf(parent) + 1 : 0;
    depth.set(id, dd);
    return dd;
  };

  const rows = new Map<number, string[]>();
  for (const p of project.panels) {
    if (!system.panels[p.id]) continue;
    const dd = depthOf(p.id);
    (rows.get(dd) ?? rows.set(dd, []).get(dd)!).push(p.id);
  }

  // Bus / supply equipment lives at the ONE service-entrance (root) panel; any
  // other standalone root is "not connected yet", not a second PLN intake.
  const rootId = serviceRootId(project, system);
  const threePh = (id: string) => byId.get(id)?.system === '3ph';
  const busDevicesFor = (id: string): BusDevice[] => {
    const out: BusDevice[] = [];
    if (id === rootId) {
      if (system.spd?.recommended) out.push({ kind: 'spd', label: system.spd.type, threePhase: threePh(id) });
      if (system.powerFactor.needed && system.powerFactor.bankKvar > 0) {
        out.push({ kind: 'cap', label: `${system.powerFactor.bankKvar} kvar`, threePhase: threePh(id) });
      }
      return out;
    }
    // Secondary SPD at a sub-board far from the origin (engine recommendation).
    const sub = system.panels[id]?.spd;
    if (sub?.recommended) out.push({ kind: 'spd', label: sub.type, threePhase: threePh(id) });
    return out;
  };
  const supplyFor = (id: string): SupplyHead | undefined => {
    if (id !== rootId) return undefined;
    const head: SupplyHead = {};
    if (system.supply.type === 'MV' && system.supply.transformerKva) {
      const units = system.supply.transformerCount ?? 1;
      head.transformer = units >= 2 ? `2× ${system.supply.transformerKva} kVA` : `${system.supply.transformerKva} kVA`;
    }
    if (system.sources?.generator) {
      head.generator = true;
      head.ats = true;
      head.transfer = system.sources.generator.transfer;
    }
    // Solar / battery hang off the main bus too — show them at the service
    // head so an enabled source is visible right where it was dropped.
    if (system.sources?.solar) head.solar = `PV ${system.sources.solar.arrayKwp} kWp`;
    if (system.sources?.battery) head.battery = `Batt ${system.sources.battery.installedKwh} kWh`;
    if (system.metering) head.meter = system.metering.metering === 'ct' ? `CT ${system.metering.ctRatio ?? ''}`.trim() : 'kWh';
    return Object.keys(head).length > 0 ? head : undefined;
  };

  const heightFor = (id: string): number => {
    const res = system.panels[id]!;
    const ci = byId.get(id)!;
    const hasRcd = res.circuits.some((c) => c.rcd.required);
    const hasStarter = res.circuits.some((c) => c.control);
    return layout(ci.system === '3ph', hasRcd, hasStarter).height;
  };

  const rowPitch =
    // expanded panel (schematic + chrome) + the external-load band below it +
    // breathing room before the next row
    Math.max(...project.panels.filter((p) => system.panels[p.id]).map((p) => heightFor(p.id)), 120) +
    PANEL_CHROME +
    LOAD_DROP_GAP +
    LOAD_NODE_H +
    80;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const [d, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const widths = ids.map((id) => panelWidth(system.panels[id]?.circuits.length ?? 0, busDevicesFor(id).length));
    const GAP = 80;
    const rowWidth = widths.reduce((s, w) => s + w, 0) + GAP * (ids.length - 1);
    let x = -rowWidth / 2;
    ids.forEach((id, i) => {
      const panel = byId.get(id);
      const res = system.panels[id];
      const w = widths[i]!;
      if (!panel || !res) {
        x += w + GAP;
        return;
      }
      const inputById = new Map(panel.circuits.map((ci) => [ci.id, ci]));
      const ways: UnifiedWay[] = res.circuits.map((c) => {
        const childId = feederWayToChild.get(c.circuitId);
        const child = childId ? byId.get(childId) : undefined;
        const ci = inputById.get(c.circuitId);
        const starter = c.control?.starterType;
        const orderCode = circuitOrderCodes(c, parts).breaker;
        return {
          id: c.circuitId,
          name: c.name,
          kind: ci?.loadKind ?? 'general',
          phase: c.phase,
          breakerA: `${c.breaker.ratingA}A`,
          breakerClass: c.breaker.deviceClass,
          ...(c.rcd.required ? { rcd: true } : {}),
          ...(starter ? { starter } : {}),
          ...(starter && THERMAL_OVERLOAD_STARTERS.has(starter) ? { overload: true } : {}),
          cable: makeupOnly(c.grounding.cableSpec),
          cableFull: c.grounding.cableSpec,
          ...(c.cable.deratedIzA > 0 ? { util: Math.round((c.designCurrentA / c.cable.deratedIzA) * 100) } : {}),
          ...(orderCode ? { orderCode } : {}),
          feeds: child ? (child.tag ?? child.name) : undefined,
          warn: !c.voltageDrop.withinLimit,
        };
      });
      const bus = res.busbar;
      const busSpec =
        bus.widthMm > 0
          ? `${bus.widthMm}×${bus.thicknessMm} mm Cu (${formatAmps(bus.ampacityA)})`
          : `${bus.csaMm2} mm² (${formatAmps(bus.ampacityA)})`;
      const supply = supplyFor(id);
      const data: UnifiedPanelData = {
        panelId: id,
        name: res.name,
        ...(panel.tag ? { tag: panel.tag } : {}),
        source: panel.sourceType,
        system: panel.system,
        loadKw: formatKw(res.totalConnectedLoadW),
        incomerA: formatAmps(res.totalDemandCurrentA),
        incomer: `${res.incomer.breaker.deviceClass} ${res.incomer.breaker.ratingA}A/${res.incomer.poles}P`,
        voltage: `${panel.voltageV} V · ${panel.system === '3ph' ? '3φ' : '1φ'}`,
        phaseBalance: {
          L1: res.phaseBalance.L1,
          L2: res.phaseBalance.L2,
          L3: res.phaseBalance.L3,
        },
        busSpec,
        neutralSpec: bus.neutralCsaMm2 ? `${bus.neutralCsaMm2} mm²` : '—',
        peSpec: bus.peCsaMm2 ? `${bus.peCsaMm2} mm²` : '—',
        ways,
        bus: busDevicesFor(id),
        ...(supply ? { supply } : {}),
        feederIds: ways.filter((wy) => wy.feeds).map((wy) => wy.id),
        // "Fed" means a REAL parent feeder exists — a template-stamped panel
        // arrives with sourceType 'feeder' but no parent, and must read as
        // not-connected until it's actually wired under one.
        ...(id !== rootId && !parentOf.has(id) ? { unfed: true } : {}),
        ...(panel.essential === true ? { essential: true } : {}),
        ...(panel.upsBacked === true ? { critical: true } : {}),
        ...(res.submeter
          ? { submeter: res.submeter.metering === 'ct' ? `CT ${res.submeter.ctRatio}` : 'kWh' }
          : {}),
        issues: toNodeIssues(res.warnings),
        onEditCircuit: (cid) => onEditCircuit(id, cid),
        onContextCircuit: (cid, x, y) => onContextCircuit(id, cid, x, y),
        onAddItem: (action) => onAddItem(id, action),
        onReorder: (ids) => onReorder(id, ids),
      };
      // draggable comes from the flow-level nodesDraggable; per-node draggable:false
      // would override it and break rearranging. Panels are deletable (Delete key).
      const panelY = d * rowPitch;
      nodes.push({ id, type: 'uPanel', position: { x: snap(x), y: snap(panelY) }, data });

      // ONLY the service-entrance panel (the MDP) shows the incoming PLN grid
      // supply as a CHILD node above its incomer — a building has one intake.
      // Other standalone roots render as "not connected" until they're fed.
      if (panel.sourceType === 'utility' && id === rootId) {
        const gridId = `grid-${id}`;
        const supplyType = system.supply.type === 'MV' ? 'MV' : 'LV';
        nodes.push({
          id: gridId,
          type: 'grid',
          parentId: id,
          position: { x: w / 2 - GRID_SRC_W / 2, y: -(GRID_SRC_H + 30) },
          deletable: false,
          draggable: false,
          // Display-only: it can't be copied or deleted, so a click-selection
          // here would only muddy what Ctrl+C is about to copy.
          selectable: false,
          data: {
            supplyType,
            voltage:
              supplyType === 'MV' && system.supply.mvVoltageV
                ? `${system.supply.mvVoltageV / 1000} kV`
                : `${panel.voltageV} V`,
            ...(data.supply?.transformer ? { transformer: data.supply.transformer } : {}),
            ...(data.supply?.meter ? { meter: data.supply.meter } : {}),
            ...(data.supply?.generator ? { generator: true } : {}),
            ...(data.supply?.transfer ? { transfer: data.supply.transfer } : {}),
            ...(data.supply?.solar ? { solar: data.supply.solar } : {}),
            ...(data.supply?.battery ? { battery: data.supply.battery } : {}),
          } satisfies GridSourceData,
        });
        edges.push({
          id: `e-grid-${id}`,
          source: gridId,
          sourceHandle: 'out',
          target: id,
          targetHandle: 'in',
          type: 'smoothstep',
          style: { stroke: 'var(--mantine-color-indigo-5)', strokeWidth: 2 },
        });

        // Distributed energy sources as their OWN external nodes beside the PLN
        // intake (generator/solar/battery), each feeding the main bus. Deleting
        // a node disables that source. The detailed ATS/inverter interlocks live
        // on the Power one-line tab; here they read as parallel sources.
        const src = system.sources;
        const srcList: SourceNodeData[] = [];
        if (src?.generator) {
          srcList.push({
            kind: 'generator',
            sub: `${src.generator.ratingKva} kVA · ${src.generator.mode}`,
            badge: src.generator.transfer === 'manual' ? 'COS' : 'ATS',
          });
        }
        if (src?.solar) {
          srcList.push({ kind: 'solar', sub: `${src.solar.arrayKwp} kWp · ${src.solar.inverterKw} kW` });
        }
        if (src?.battery) {
          srcList.push({ kind: 'battery', sub: `${src.battery.installedKwh} kWh · ${src.battery.inverterKw} kW` });
        }
        const plnX = w / 2 - GRID_SRC_W / 2;
        const SRC_GAP = 16;
        srcList.forEach((sd, k) => {
          const srcId = `src-${sd.kind}-${id}`;
          nodes.push({
            id: srcId,
            type: 'source',
            parentId: id,
            // To the LEFT of the PLN intake, on the same row.
            position: { x: plnX - (k + 1) * (GRID_SRC_W + SRC_GAP), y: -(GRID_SRC_H + 30) },
            draggable: false,
            data: sd,
          });
          edges.push({
            id: `e-${srcId}`,
            source: srcId,
            sourceHandle: 'out',
            target: id,
            targetHandle: 'in',
            type: 'smoothstep',
            style: { stroke: SOURCE_NODE_STYLE[sd.kind].color, strokeWidth: 2, strokeDasharray: '5 3' },
          });
        });
      }

      // Each non-feeder way's LOAD hangs outside the panel as its own CHILD node,
      // wired to that way's MCB output. As a child its position is relative to the
      // panel, so (a) dragging the panel drags every load with it, and (b) the load
      // sits directly under its MCB (center at wayCx) → the drop cable is dead
      // straight. Feeder ways connect to their sub-panel instead.
      const panelH = heightFor(id);
      ways.forEach((wy, i) => {
        if (wy.feeds) return;
        // A spare way has nothing connected: its breaker + open terminal in the
        // panel schematic IS the representation — no external load node.
        if (wy.kind === 'spare') return;
        const loadId = `load-${wy.id}`;
        const wayCx = LEFT + i * WAY_W + WAY_W / 2;
        nodes.push({
          id: loadId,
          type: 'load',
          parentId: id,
          // Clear the FULL expanded card (schematic + header/padding), not just the
          // SVG, so the load never lands inside the panel when it expands on zoom-in.
          position: { x: wayCx - LOAD_W / 2, y: panelH + PANEL_CHROME + LOAD_DROP_GAP },
          // Selectable + deletable: Delete (or box-select + Delete) removes the
          // way's circuit. Glued under its MCB and moved by the panel; dragging
          // it itself would only reset on the next recompute, so not draggable.
          deletable: true,
          draggable: false,
          data: {
            kind: wy.kind,
            name: wy.name,
            breakerA: wy.breakerA,
            cable: wy.cable,
            util: wy.util,
            phase: wy.phase,
            threePhase: panel.system === '3ph',
            warn: wy.warn,
            panelId: id,
            circuitId: wy.id,
            ...(wy.orderCode ? { orderCode: wy.orderCode } : {}),
            onEdit: () => onEditCircuit(id, wy.id),
            onContext: (mx: number, my: number) => onContextCircuit(id, wy.id, mx, my),
          },
        });
        // Label the drop cable with its size (+ loading %), like the feeders — and
        // make double-clicking the line open the cable editor for that circuit.
        const loadLabel = wy.util !== undefined ? `${wy.cable} · ${wy.util}%` : wy.cable;
        edges.push({
          id: `e-${loadId}`,
          source: id,
          sourceHandle: wy.id,
          target: loadId,
          targetHandle: 'in',
          type: 'feeder',
          style: { stroke: PHASE_COLOR[wy.phase] ?? 'var(--mantine-color-gray-5)', strokeWidth: 1.6 },
          // Alternate the label height on neighbouring drops so even long
          // labels ("4×50 mm² · 68%") never sit side-by-side on one line.
          data: {
            label: loadLabel,
            util: wy.util,
            panelId: id,
            circuitId: wy.id,
            // Bias the label DOWN into the lower-middle of the drop (away from
            // the feeder-outlet dot at the panel bottom), alternating the two
            // heights so neighbouring drops never share a line.
            offset: i % 2 === 0 ? 6 : 22,
          },
        });
      });
      x += w + GAP;
    });
  }

  // Group feeders by parent so sibling cables can be staggered apart.
  const feedersByParent = new Map<string, { circuitId: string; childId: string }[]>();
  for (const [circuitId, childId] of feederWayToChild) {
    const parentId = parentOf.get(childId);
    if (!parentId || !system.panels[childId] || !system.panels[parentId]) continue;
    const list = feedersByParent.get(parentId) ?? [];
    list.push({ circuitId, childId });
    feedersByParent.set(parentId, list);
  }

  for (const [parentId, list] of feedersByParent) {
    list.forEach(({ circuitId, childId }, i) => {
      const feederWay = system.panels[parentId]?.circuits.find((c) => c.circuitId === circuitId);
      // Cable loading: load current ÷ the cable's derated ampacity.
      const util =
        feederWay && feederWay.cable.deratedIzA > 0
          ? Math.round((feederWay.designCurrentA / feederWay.cable.deratedIzA) * 100)
          : undefined;
      const feederLabel = feederWay
        ? `${feederWay.breaker.ratingA}A · ${makeupOnly(feederWay.grounding.cableSpec)}${
            util !== undefined ? ` · ${util}%` : ''
          }`
        : undefined;
      // Spread sibling centre-lines around the midpoint so cables + labels don't stack.
      const offset = (i - (list.length - 1) / 2) * 26;
      edges.push({
        id: `feed-${circuitId}`,
        source: parentId,
        sourceHandle: circuitId,
        target: childId,
        targetHandle: 'in',
        type: 'feeder',
        // panelId + circuitId let a double-click open this feeder's editor.
        data: { label: feederLabel, offset, panelId: parentId, circuitId, util },
        style: { stroke: 'var(--mantine-color-indigo-4)', strokeWidth: 2 },
      });
    });
  }

  // Floating loads: dropped on the canvas, not yet wired to a panel.
  for (const fl of floatingLoads) {
    nodes.push({
      id: `float-${fl.id}`,
      type: 'floatLoad',
      position: { x: snap(fl.position.x), y: snap(fl.position.y) },
      deletable: true,
      data: { kind: fl.loadKind, name: fl.name, loadW: fl.loadW },
    });
  }

  return { nodes, edges };
}

export function BuildingSingleLine({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const allParts = useProjectStore((s) => s.parts);
  const preferredBrand = useProjectStore((s) => s.preferredBrand);
  // Inline order codes follow the chosen export brand (cables stay available).
  const parts = useMemo(() => partsForBrand(allParts, preferredBrand), [allParts, preferredBrand]);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const addCircuitConfigured = useProjectStore((s) => s.addCircuitConfigured);
  const addSubPanel = useProjectStore((s) => s.addSubPanel);
  const addPanel = useProjectStore((s) => s.addPanel);
  const connectPanelAsFeeder = useProjectStore((s) => s.connectPanelAsFeeder);
  const disconnectFeeder = useProjectStore((s) => s.disconnectFeeder);
  const removePanel = useProjectStore((s) => s.removePanel);
  const floatingLoads = useProjectStore((s) => s.floatingLoads);
  const addFloatingLoad = useProjectStore((s) => s.addFloatingLoad);
  const moveFloatingLoad = useProjectStore((s) => s.moveFloatingLoad);
  const removeFloatingLoad = useProjectStore((s) => s.removeFloatingLoad);
  const attachFloatingLoad = useProjectStore((s) => s.attachFloatingLoad);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  // Where a just-created panel should land (the drop point), consumed once by
  // the node-sync effect — new nodes otherwise get the auto-layout position.
  const pendingPanelPos = useRef(new Map<string, { x: number; y: number }>());
  // Last mouse position over the canvas (screen coords) — paste anchors here.
  const mousePos = useRef<{ x: number; y: number } | null>(null);
  const pastePanels = useProjectStore((s) => s.pastePanels);
  const pasteCircuits = useProjectStore((s) => s.pasteCircuits);
  const reorderCircuits = useProjectStore((s) => s.reorderCircuits);
  const updateCircuit = useProjectStore((s) => s.updateCircuit);
  const duplicateCircuit = useProjectStore((s) => s.duplicateCircuit);
  const removeCircuit = useProjectStore((s) => s.removeCircuit);
  const saveAsTemplate = useProjectStore((s) => s.saveAsTemplate);
  const addSpareWays = useProjectStore((s) => s.addSpareWays);
  const setPhaseAssignments = useProjectStore((s) => s.setPhaseAssignments);
  const updatePanel = useProjectStore((s) => s.updatePanel);

  // Edit on the canvas: double-click a component → its circuit editor; double-
  // click a panel → its full toolset in a side inspector (no screen change).
  const [editing, setEditing] = useState<{ panelId: string; circuitId: string; focus: 'device' | 'cable' } | null>(null);
  const [inspectPanelId, setInspectPanelId] = useState<string | null>(null);
  // Draggable palette width (persisted). Default WIDE ENOUGH that no card name
  // is clipped out of the box ("Industrial socket (3φ)", "Solar PV + inverter");
  // the grip bar resizes 130–420 px, double-click resets to the fit width.
  const PALETTE_FIT_W = 210;
  const clampPaletteW = (w: number) => Math.max(130, Math.min(420, w));
  const [paletteW, setPaletteW] = useState<number>(() => {
    const saved = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('pm:paletteW')) : NaN;
    return Number.isFinite(saved) && saved >= 130 ? clampPaletteW(saved) : PALETTE_FIT_W;
  });
  const persistPaletteW = (w: number) => {
    try {
      localStorage.setItem('pm:paletteW', String(Math.round(w)));
    } catch {
      /* storage unavailable — width still applies for the session */
    }
  };
  const startPaletteResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = paletteW;
      const onMove = (ev: PointerEvent) => {
        setPaletteW(clampPaletteW(startW + (ev.clientX - startX)));
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persistPaletteW(clampPaletteW(startW + (ev.clientX - startX)));
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [paletteW],
  );
  // Right-click → replacement-parts menu anchored at the cursor.
  const [ctx, setCtx] = useState<{ panelId: string; circuitId: string; x: number; y: number } | null>(null);
  // Right-click a feeder edge → disconnect / edit menu at the cursor.
  const [edgeCtx, setEdgeCtx] = useState<{ panelId: string; circuitId: string; x: number; y: number } | null>(null);
  // Right-click a panel → open / delete menu at the cursor.
  const [nodeCtx, setNodeCtx] = useState<{ panelId: string; x: number; y: number } | null>(null);
  // "Panel settings…" straight from the canvas (voltage / system / derating),
  // without drilling through the inspector drawer.
  const [settingsPanelId, setSettingsPanelId] = useState<string | null>(null);
  // "Save as template…" on a panel: name prompt before snapshotting.
  const [tplPrompt, setTplPrompt] = useState<{ panelId: string; name: string } | null>(null);
  const commitTemplate = () => {
    if (!tplPrompt) return;
    const label =
      tplPrompt.name.trim() || (project.panels.find((p) => p.id === tplPrompt.panelId)?.name ?? '');
    saveAsTemplate(tplPrompt.panelId, label);
    notifications.show({ message: t('templateSave.saved', { name: label }), color: 'teal' });
    setTplPrompt(null);
  };
  // Deleting a panel that feeds sub-panels disconnects them — confirm first.
  // The pending promise resolves when the user picks Delete (true) or Cancel.
  const [deleteConfirm, setDeleteConfirm] = useState<{
    panelNames: string[];
    childNames: string[];
    resolve: (ok: boolean) => void;
  } | null>(null);

  /**
   * Resolve true when the panels can be deleted: immediately when none of them
   * feeds a surviving sub-panel, otherwise after the user confirms in the
   * cascade-warning modal. Undo remains the safety net either way.
   */
  const confirmPanelDelete = useCallback(
    (panelIds: string[]): Promise<boolean> => {
      const childNames = fedSubPanelNames(project, panelIds);
      if (childNames.length === 0) return Promise.resolve(true);
      const panelNames = project.panels.filter((p) => panelIds.includes(p.id)).map((p) => p.name);
      return new Promise((resolve) => setDeleteConfirm({ panelNames, childNames, resolve }));
    },
    [project],
  );

  const disconnectEdge = useCallback(
    (panelId: string, circuitId: string) => {
      disconnectFeeder(panelId, circuitId);
      notifications.show({ message: t('sldMenu.disconnected'), color: 'gray' });
    },
    [disconnectFeeder, t],
  );

  const openCircuit = useCallback(
    (panelId: string, circuitId: string, focus: 'device' | 'cable' = 'device') => {
      setEditing({ panelId, circuitId, focus });
    },
    [],
  );
  const openContext = useCallback((panelId: string, circuitId: string, x: number, y: number) => {
    setCtx({ panelId, circuitId, x, y });
  }, []);
  const openInspector = useCallback(
    (panelId: string) => {
      setActivePanel(panelId);
      setInspectPanelId(panelId);
    },
    [setActivePanel],
  );

  // Source cards enable a PROJECT-level energy source (shown on the service
  // head + the power one-line); the Sources screen is where it's tuned.
  const updateSources = useProjectStore((s) => s.updateSources);
  const enableSource = useCallback(
    (kind: SourceKind) => {
      const sources = useProjectStore.getState().project.sources;
      const name = t(`vbuilder.${kind}`);
      if (sources?.[kind]?.enabled) {
        notifications.show({ message: t('sldSources.already', { name }), color: 'blue' });
        return;
      }
      if (kind === 'generator') {
        updateSources({ generator: { ...DEFAULT_GENERATOR, ...sources?.generator, enabled: true } });
      } else if (kind === 'solar') {
        updateSources({ solar: { ...DEFAULT_SOLAR, ...sources?.solar, enabled: true } });
      } else {
        updateSources({ battery: { ...DEFAULT_BATTERY, ...sources?.battery, enabled: true } });
      }
      notifications.show({ message: t('sldSources.enabled', { name }), color: 'teal' });
    },
    [updateSources, t],
  );

  // Delete a source node → disable that source (the counterpart to dropping it).
  const disableSource = useCallback(
    (kind: SourceKind) => {
      const sources = useProjectStore.getState().project.sources;
      const cfg = sources?.[kind];
      if (!cfg) return;
      updateSources({ [kind]: { ...cfg, enabled: false } });
      notifications.show({ message: t('sldSources.disabled', { name: t(`vbuilder.${kind}`) }), color: 'gray' });
    },
    [updateSources, t],
  );

  // Drop a palette card on a panel → add the way / sub-panel there.
  const addItem = useCallback(
    (panelId: string, action: SldAdd) => {
      if (action.type === 'source') {
        enableSource(action.source);
        return;
      }
      if (action.type === 'subpanel') {
        addSubPanel(panelId);
        notifications.show({ message: t('vbuilder.subpanelAdded'), color: 'teal' });
        return;
      }
      const panel = project.panels.find((p) => p.id === panelId);
      const count = (panel?.circuits.length ?? 0) + 1;
      addCircuitConfigured(panelId, {
        name: `${t(action.nameKey)} ${count}`,
        role: 'branch',
        loadW: 0,
        cosPhi: 0.85,
        lengthM: 20,
        loadKind: action.loadKind,
        isLighting: action.loadKind === 'lighting',
        demandFactor: 1,
        ...action.defaults,
      });
      notifications.show({ message: t('vbuilder.added', { name: t(action.nameKey) }), color: 'teal' });
    },
    [project, addCircuitConfigured, addSubPanel, enableSource, t],
  );

  // Drop on the empty canvas (not on a panel): a sub-panel becomes a new
  // top-level panel; a load needs a panel, so we nudge the user to drop on one.
  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(SLD_DND);
      if (!raw) return;
      e.preventDefault();
      let action: SldAdd;
      try {
        action = JSON.parse(raw) as SldAdd;
      } catch {
        return;
      }
      const p = rfRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 80, y: 80 };
      if (action.type === 'source') {
        // Sources are project-level — same effect wherever the card lands.
        enableSource(action.source);
        return;
      }
      if (action.type === 'subpanel') {
        // A panel dropped on empty canvas is a STANDALONE panel (nothing feeds
        // it yet) — say so, and put it where it was dropped, not where the
        // auto-layout would park it.
        const id = addPanel();
        pendingPanelPos.current.set(id, { x: snap(p.x - 150), y: snap(p.y - 40) });
        notifications.show({ message: t('system.panelAddedUnfed'), color: 'teal' });
        return;
      }
      // Drop a load on the canvas → a floating load to wire into a panel.
      addFloatingLoad({
        name: t(action.nameKey),
        loadKind: action.loadKind,
        loadW: action.defaults.loadW ?? 1000,
        cosPhi: action.defaults.cosPhi ?? 0.85,
        // Keep the kind's demand factor: losing it here would make the same
        // card size differently via drop-on-canvas vs drop-on-panel.
        demandFactor: action.defaults.demandFactor ?? 1,
        isLighting: action.loadKind === 'lighting',
        ...(action.defaults.motorKw !== undefined ? { motorKw: action.defaults.motorKw } : {}),
        ...(action.defaults.starterType !== undefined ? { starterType: action.defaults.starterType } : {}),
        ...(action.defaults.phases !== undefined ? { phases: action.defaults.phases } : {}),
        ...(action.defaults.lifeSafety === true ? { lifeSafety: true } : {}),
        position: { x: p.x - (LOAD_W + 8) / 2, y: p.y - 16 },
      });
      notifications.show({ message: t('system.loadDropped'), color: 'teal' });
    },
    [addPanel, addFloatingLoad, enableSource, t],
  );

  const built = useMemo(
    () => buildUnified(project, system, openCircuit, addItem, openContext, reorderCircuits, floatingLoads, parts),
    [project, system, openCircuit, addItem, openContext, reorderCircuits, floatingLoads, parts],
  );
  const edges = built.edges;
  // Panels are auto-arranged from the feeder tree, but draggable to rearrange.
  // Keep React Flow's node state so a drag sticks; re-sync node *data* when the
  // model changes while preserving any positions the user has dragged.
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  useEffect(() => {
    setNodes((cur) => {
      const posById = new Map(cur.map((n) => [n.id, n.position]));
      // Keep the user's selection across model rebuilds — every edit regenerates
      // the nodes, and losing `selected` here made select→Delete/copy flows
      // appear broken whenever a recompute landed in between.
      const selected = new Set(cur.filter((n) => n.selected).map((n) => n.id));
      return built.nodes.map((n) => {
        const dropped = pendingPanelPos.current.get(n.id);
        const sel = selected.has(n.id) ? { selected: true } : {};
        if (dropped) {
          pendingPanelPos.current.delete(n.id);
          return { ...n, ...sel, position: dropped };
        }
        // Only USER-PLACED nodes keep their dragged position. Layout-managed
        // children (a panel's grid-supply head and its load nodes) must take
        // the fresh layout position — preserving theirs left them stranded at
        // stale offsets whenever the panel's width/way count changed.
        const userPlaced = n.type === 'uPanel' || n.type === 'floatLoad';
        return { ...n, ...sel, position: userPlaced ? (posById.get(n.id) ?? n.position) : n.position };
      });
    });
  }, [built.nodes, setNodes]);

  // A panel's EXPANDED footprint (width × detail height), so a drag can be nudged
  // clear of other panels even while zoomed out (where the card looks short).
  const panelBox = useCallback(
    (panelId: string): { w: number; h: number } => {
      const res = system.panels[panelId];
      const panel = project.panels.find((p) => p.id === panelId);
      if (!res || !panel) return { w: 300, h: 130 };
      const hasRcd = res.circuits.some((c) => c.rcd.required);
      const hasStarter = res.circuits.some((c) => c.control);
      return {
        w: panelWidth(res.circuits.length, 0),
        // The card now reserves the schematic height at every zoom, so its real
        // footprint is the schematic plus the title/padding chrome.
        h: layout(panel.system === '3ph', hasRcd, hasStarter).height + PANEL_CHROME,
      };
    },
    [system, project],
  );

  // On drop, push the dragged panel down until it no longer overlaps any other —
  // using expanded sizes, so panels don't collide once you zoom in.
  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      if (node.type === 'floatLoad') {
        // Snap a dropped load onto the nearest panel (within reach) and wire it up
        // automatically — otherwise just leave it floating where it landed.
        const fid = node.id.replace(/^float-/, '');
        const cx = node.position.x + (LOAD_W + 8) / 2;
        const cy = node.position.y + LOAD_NODE_H / 2;
        let best: { id: string; dist: number } | null = null;
        for (const n of nodes) {
          if (n.type !== 'uPanel') continue;
          const b = panelBox(n.id);
          // Distance from the drop point to the panel's box (0 when inside it).
          const dx = Math.max(n.position.x - cx, 0, cx - (n.position.x + b.w));
          const dy = Math.max(n.position.y - cy, 0, cy - (n.position.y + b.h));
          const dist = Math.hypot(dx, dy);
          if (!best || dist < best.dist) best = { id: n.id, dist };
        }
        if (best && best.dist <= 160) attachFloatingLoad(fid, best.id);
        else moveFloatingLoad(fid, node.position);
        return;
      }
      if (node.type !== 'uPanel') return; // only keep panels from overlapping
      setNodes((cur) => {
        const me = panelBox(node.id);
        let { x, y } = node.position;
        const M = 28;
        for (let pass = 0; pass < 40; pass++) {
          let bumped = false;
          for (const n of cur) {
            if (n.id === node.id || n.type !== 'uPanel') continue;
            const o = panelBox(n.id);
            if (x < n.position.x + o.w + M && x + me.w + M > n.position.x && y < n.position.y + o.h + M && y + me.h + M > n.position.y) {
              y = snap(n.position.y + o.h + M); // drop below the obstacle, on-grid
              bumped = true;
            }
          }
          if (!bumped) break;
        }
        return cur.map((n) => (n.id === node.id ? { ...n, position: { x, y } } : n));
      });
    },
    [panelBox, setNodes, moveFloatingLoad, attachFloatingLoad, nodes],
  );

  /** Nearest panel to a canvas point (distance to its expanded box; 0 inside). */
  const nearestPanelId = useCallback(
    (pt: { x: number; y: number }): string | null => {
      let best: { id: string; dist: number } | null = null;
      for (const n of nodes) {
        if (n.type !== 'uPanel') continue;
        const b = panelBox(n.id);
        const dx = Math.max(n.position.x - pt.x, 0, pt.x - (n.position.x + b.w));
        const dy = Math.max(n.position.y - pt.y, 0, pt.y - (n.position.y + b.h));
        const dist = Math.hypot(dx, dy);
        if (!best || dist < best.dist) best = { id: n.id, dist };
      }
      return best?.id ?? null;
    },
    [nodes, panelBox],
  );

  // Canvas clipboard: Ctrl/Cmd+C snapshots the SELECTED nodes (panels, ways'
  // loads, floating loads); Ctrl/Cmd+V pastes them AT THE CURSOR (panels keep
  // their relative layout; copied ways land in the panel nearest the mouse).
  // Held outside project history so undo never clears what was copied.
  const canvasClipboard = useRef<{
    panels: { snapshot: PanelInput; position: { x: number; y: number } }[];
    circuits: { panelId: string; circuit: CircuitInput }[];
    floats: FloatingLoad[];
  } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;
      // Never hijack copy/paste from text fields or open editors.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const state = useProjectStore.getState();

      if (key === 'c') {
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        const panels: { snapshot: PanelInput; position: { x: number; y: number } }[] = [];
        const circuits: { panelId: string; circuit: CircuitInput }[] = [];
        const floats: FloatingLoad[] = [];
        const copiedPanelIds = new Set(
          selected.filter((n) => n.type === 'uPanel').map((n) => n.id),
        );
        for (const n of selected) {
          if (n.type === 'uPanel') {
            const p = state.project.panels.find((x) => x.id === n.id);
            if (p) panels.push({ snapshot: structuredClone(p), position: { ...n.position } });
          } else if (n.type === 'load') {
            // A way's load node: copy its circuit — unless its whole panel is
            // also selected (the panel copy already carries it).
            const circuitId = n.id.replace(/^load-/, '');
            const owner = state.project.panels.find((p) =>
              p.circuits.some((c) => c.id === circuitId),
            );
            const circuit = owner?.circuits.find((c) => c.id === circuitId);
            if (owner && circuit && !copiedPanelIds.has(owner.id)) {
              circuits.push({ panelId: owner.id, circuit: structuredClone(circuit) });
            }
          } else if (n.type === 'floatLoad') {
            const f = state.floatingLoads.find((x) => `float-${x.id}` === n.id);
            if (f) floats.push(structuredClone(f));
          }
        }
        if (panels.length === 0 && circuits.length === 0 && floats.length === 0) return;
        canvasClipboard.current = { panels, circuits, floats };
        e.preventDefault();
        notifications.show({
          message: t('sldClipboard.copied', { count: panels.length + circuits.length + floats.length }),
          color: 'teal',
        });
        return;
      }

      const clip = canvasClipboard.current;
      if (!clip) return;
      e.preventDefault();
      const OFFSET = GRID * 2;
      // Paste lands AT THE CURSOR, not on top of the originals: the copied
      // group keeps its relative layout, anchored at the mouse position
      // (last-known canvas position; offset-from-original as the fallback).
      const at = mousePos.current ? rfRef.current?.screenToFlowPosition(mousePos.current) : undefined;
      const anchors = [
        ...clip.panels.map((p) => p.position),
        ...clip.floats.map((f) => f.position),
      ];
      const minX = Math.min(...anchors.map((p) => p.x));
      const minY = Math.min(...anchors.map((p) => p.y));
      const placed = (orig: { x: number; y: number }) =>
        at
          ? { x: snap(at.x + (orig.x - minX)), y: snap(at.y + (orig.y - minY)) }
          : { x: snap(orig.x + OFFSET), y: snap(orig.y + OFFSET) };

      if (clip.panels.length > 0) {
        const newIds = pastePanels(clip.panels.map((p) => p.snapshot));
        newIds.forEach((id, i) => {
          const src = clip.panels[i];
          if (src) pendingPanelPos.current.set(id, placed(src.position));
        });
      }
      if (clip.circuits.length > 0) {
        // Copied ways land in the panel NEAREST THE CURSOR — that's where the
        // user is pointing — falling back to their source panel without one.
        const target = at ? nearestPanelId(at) : null;
        pasteCircuits(
          target
            ? clip.circuits.map((it) => ({ ...it, panelId: target }))
            : clip.circuits,
        );
      }
      for (const f of clip.floats) {
        const { id: _id, position, ...rest } = f;
        addFloatingLoad({ ...rest, position: placed(position) });
      }
      notifications.show({
        message: t('sldClipboard.pasted', {
          count: clip.panels.length + clip.circuits.length + clip.floats.length,
        }),
        color: 'teal',
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodes, pastePanels, pasteCircuits, addFloatingLoad, nearestPanelId, t]);

  const editingPanel = editing ? project.panels.find((p) => p.id === editing.panelId) : undefined;
  const editingCircuit = editingPanel?.circuits.find((c) => c.id === editing?.circuitId);
  const editingResult = editing
    ? system.panels[editing.panelId]?.circuits.find((c) => c.circuitId === editing.circuitId)
    : undefined;

  // Replacement-parts options for the right-clicked circuit: standard breaker
  // ratings ≥ its design current and cable sections ≥ its present size (the
  // "appropriate" parts), plus its current values for reference.
  const ctxResult = ctx
    ? system.panels[ctx.panelId]?.circuits.find((c) => c.circuitId === ctx.circuitId)
    : undefined;
  const ctxName = ctxResult?.name;
  const breakerOptions = ctxResult
    ? STANDARD_BREAKER_RATINGS_A.filter((r) => r >= ctxResult.designCurrentA).slice(0, 6)
    : [];
  const cableOptions = ctxResult
    ? STANDARD_SECTIONS_MM2.filter((s) => s >= ctxResult.cable.csaMm2).slice(0, 6)
    : [];
  const applyAndClose = (patch: Parameters<typeof updateCircuit>[2]) => {
    if (ctx) updateCircuit(ctx.panelId, ctx.circuitId, patch);
    setCtx(null);
  };

  // Spare ways still missing vs the engine's ~20% recommendation, for the
  // right-clicked panel — drives the one-click "add recommended spares".
  const ctxSpares = (() => {
    if (!nodeCtx) return 0;
    const sp = system.panels[nodeCtx.panelId]?.spare;
    return sp ? Math.max(0, sp.recommendedSpareWays - sp.spareWaysPresent) : 0;
  })();
  const ctxPanel = nodeCtx ? project.panels.find((p) => p.id === nodeCtx.panelId) : undefined;

  // One-click L1/L2/L3 re-distribution of a 3-phase panel's 1-phase circuits:
  // pins each to its balanced line (the same engine pass the old builder had).
  const autoBalance = (panelId: string) => {
    const res = system.panels[panelId];
    const panel = project.panels.find((p) => p.id === panelId);
    if (!res || !panel) return;
    const phaseCircuits: PhaseCircuit[] = res.circuits.map((cr) => ({
      id: cr.circuitId,
      currentA: cr.designCurrentA,
      threePhase: cr.phase === '3ph',
    }));
    const bal = balancePhases(phaseCircuits, panel.system);
    const assignment: Record<string, 'L1' | 'L2' | 'L3'> = {};
    for (const cr of res.circuits) {
      const a = bal.assignment[cr.circuitId];
      if (a === 'L1' || a === 'L2' || a === 'L3') assignment[cr.circuitId] = a;
    }
    if (Object.keys(assignment).length === 0) {
      notifications.show({ message: t('vbuilder.phaseNothing'), color: 'yellow' });
      return;
    }
    setPhaseAssignments(panelId, assignment);
    notifications.show({ message: t('vbuilder.phaseBalanced', { pct: bal.imbalancePct }), color: 'teal' });
  };

  return (
    <Group align="stretch" gap="sm" wrap="nowrap" h="clamp(560px, calc(100vh - 220px), 880px)">
      {/* Palette — drag a card onto a panel to add it there. The VISIBLE grip
          bar on the right edge resizes it; double-click resets to the width
          that fits every card name. */}
      <Box style={{ position: 'relative', flexShrink: 0, width: paletteW }}>
        <PaletteGrip
          onPointerDown={startPaletteResize}
          onDoubleClick={() => {
            setPaletteW(PALETTE_FIT_W);
            persistPaletteW(PALETTE_FIT_W);
          }}
          title={t('system.paletteResize')}
        />
      <Card withBorder radius="md" padding="xs" h="100%" style={{ overflowY: 'auto' }}>
        <Group gap={4} mb={6} wrap="nowrap">
          <IconHandMove size={13} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed" fw={600}>
            {t('system.dragToPanel')}
          </Text>
        </Group>
        <Stack gap={5}>
          {SLD_PALETTE.map((item) => (
            <Paper
              key={item.key}
              withBorder
              radius="sm"
              p={5}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SLD_DND, JSON.stringify(item.action));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              style={{ cursor: 'grab', userSelect: 'none' }}
            >
              <Group gap={6} wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color={item.action.type === 'subpanel' ? 'teal' : 'indigo'}>
                  {item.icon}
                </ThemeIcon>
                <Text size="xs" fw={500} lineClamp={1}>
                  {t(item.labelKey)}
                </Text>
              </Group>
            </Paper>
          ))}

          {/* Energy sources: dropping a card enables the source project-wide. */}
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt={6} style={{ letterSpacing: '0.04em' }}>
            {t('vbuilder.groupSources')}
          </Text>
          {SOURCE_PALETTE.map((item) => (
            <Paper
              key={item.key}
              withBorder
              radius="sm"
              p={5}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SLD_DND, JSON.stringify({ type: 'source', source: item.key } satisfies SldAdd));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              style={{ cursor: 'grab', userSelect: 'none' }}
            >
              <Group gap={6} wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color="orange">
                  {item.icon}
                </ThemeIcon>
                <Text size="xs" fw={500} lineClamp={1}>
                  {t(item.labelKey)}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Card>
      </Box>

      <Box
        style={{ flex: 1, minWidth: 0 }}
        onMouseMove={(e) => {
          mousePos.current = { x: e.clientX, y: e.clientY };
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(SLD_DND)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={onCanvasDrop}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={UNIFIED_NODE_TYPES}
            edgeTypes={UNIFIED_EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.5}
            snapToGrid
            snapGrid={[GRID, GRID]}
            nodesConnectable
            nodesDraggable
            elementsSelectable
            // CAD-style gestures: left-drag on empty canvas draws a selection
            // box (touching a node selects it — Partial, like a crossing
            // window); the SCROLL WHEEL zooms; middle-button (wheel-click) drag
            // pans. The left button is purely select + move.
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1]}
            deleteKeyCode={['Backspace', 'Delete']}
            zoomOnDoubleClick={false}
            onInit={(inst) => {
              rfRef.current = inst;
            }}
            onConnect={(c) => {
              if (!c.source || !c.target || c.source === c.target) return;
              const isFloat = (id: string) => id.startsWith('float-');
              const isPanel = (id: string) =>
                !id.startsWith('float-') && !id.startsWith('load-') && !id.startsWith('grid-') && !id.startsWith('src-');
              // Wire a floating load to a panel → create its MCB; or panel→panel feeder.
              if (isFloat(c.source) && isPanel(c.target)) attachFloatingLoad(c.source.replace(/^float-/, ''), c.target);
              else if (isFloat(c.target) && isPanel(c.source)) attachFloatingLoad(c.target.replace(/^float-/, ''), c.source);
              else if (isPanel(c.source) && isPanel(c.target)) {
                // A refused connect must say WHY — a gesture that silently does
                // nothing reads as a bug, not as a rule.
                const res = connectPanelAsFeeder(c.source, c.target);
                const child = project.panels.find((p) => p.id === c.target);
                const name = child ? (child.tag ?? child.name) : '';
                if (res === 'connected') {
                  notifications.show({ message: t('vbuilder.panelConnected', { name }), color: 'teal' });
                } else if (res === 'has-parent') {
                  notifications.show({ message: t('sldConnect.hasParent', { name }), color: 'yellow' });
                } else if (res === 'cycle') {
                  notifications.show({ message: t('sldConnect.cycle'), color: 'yellow' });
                }
              }
            }}
            onBeforeDelete={async ({ nodes: dn }) => {
              // Deleting a panel that feeds sub-panels disconnects them all —
              // ask first (Delete/Backspace path; the context menu asks too).
              const panelIds = dn.filter((n) => n.type === 'uPanel').map((n) => n.id);
              return panelIds.length === 0 ? true : confirmPanelDelete(panelIds);
            }}
            onDelete={({ nodes: dn, edges: de }) => {
              // Delete (or Backspace): remove selected panels / floating loads;
              // disconnect selected feeders. A feeder whose panel is itself being
              // removed is skipped (removePanel cleans it up) to avoid double work.
              const removed = new Set(dn.map((n) => n.id));
              for (const e of de) {
                const pid = e.data?.panelId as string | undefined;
                const cid = e.data?.circuitId as string | undefined;
                if (pid && cid && !removed.has(e.source) && !removed.has(e.target)) disconnectEdge(pid, cid);
              }
              for (const n of dn) {
                if (n.type === 'floatLoad') removeFloatingLoad(n.id.replace(/^float-/, ''));
                else if (n.type === 'uPanel') removePanel(n.id);
                else if (n.type === 'load') {
                  // A way's load node → remove its circuit. Skip when the load's
                  // own panel is also being deleted (removePanel handles it).
                  const pid = n.data?.panelId as string | undefined;
                  const cid = n.data?.circuitId as string | undefined;
                  if (pid && cid && !removed.has(pid)) removeCircuit(pid, cid);
                } else if (n.type === 'source') {
                  disableSource((n.data as { kind: SourceKind }).kind);
                }
              }
            }}
            onEdgeContextMenu={(e, edge) => {
              e.preventDefault();
              const pid = edge.data?.panelId as string | undefined;
              const cid = edge.data?.circuitId as string | undefined;
              if (pid && cid) setEdgeCtx({ panelId: pid, circuitId: cid, x: e.clientX, y: e.clientY });
            }}
            onNodeDoubleClick={(_, node) => {
              // Only panels open the inspector; loads handle their own double-click
              // (inline circuit editor) and the grid source is display-only.
              if (node.type === 'uPanel') openInspector(node.id);
            }}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={(e, node) => {
              if (node.type !== 'uPanel') return; // panel actions only
              e.preventDefault();
              setNodeCtx({ panelId: node.id, x: e.clientX, y: e.clientY });
            }}
            onEdgeDoubleClick={(_, edge) => {
              // Double-click a feeder cable → edit it (length, size, …).
              const pid = edge.data?.panelId as string | undefined;
              const cid = edge.data?.circuitId as string | undefined;
              if (pid && cid) openCircuit(pid, cid, 'cable');
            }}
          >
            <Background gap={GRID} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={2}
              nodeColor={(n) =>
                n.type === 'uPanel'
                  ? 'var(--mantine-color-indigo-5)'
                  : n.type === 'grid'
                    ? '#c92a2a'
                    : n.type === 'floatLoad'
                      ? 'var(--mantine-color-orange-5)'
                      : 'var(--mantine-color-gray-5)'
              }
              style={{ width: 150, height: 100 }}
            />
            <Panel position="top-right">
              <CanvasHelp />
            </Panel>
            {preferredBrand && (
              <Panel position="top-left">
                <Badge variant="light" color="indigo" size="sm" radius="sm">
                  {t('system.codesBrand', { brand: preferredBrand })}
                </Badge>
              </Panel>
            )}
          </ReactFlow>
        </ReactFlowProvider>
      </Box>

      {/* Inline circuit editor (double-click a component on the diagram). */}
      {editing && editingCircuit && (
        <CircuitEditor
          panelId={editing.panelId}
          circuit={editingCircuit}
          result={editingResult}
          focus={editing.focus}
          opened
          onClose={() => setEditing(null)}
        />
      )}

      {/* Side inspector: the focused panel's full toolset, on the single-line. */}
      <Drawer
        opened={inspectPanelId !== null}
        onClose={() => setInspectPanelId(null)}
        position="right"
        size="82%"
        title={project.panels.find((p) => p.id === inspectPanelId)?.name ?? 'Panel'}
        keepMounted={false}
      >
        {inspectPanelId !== null && <PanelEditor />}
      </Drawer>

      {/* Right-click replacement-parts menu, anchored at the cursor. */}
      <Menu opened={ctx !== null} onClose={() => setCtx(null)} position="right-start" width={216} shadow="md" withinPortal>
        <Menu.Target>
          <div style={{ position: 'fixed', left: ctx?.x ?? 0, top: ctx?.y ?? 0, width: 1, height: 1 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{ctxName ?? t('sldMenu.circuit')}</Menu.Label>
          <Menu.Item
            onClick={() => {
              if (ctx) openCircuit(ctx.panelId, ctx.circuitId);
              setCtx(null);
            }}
          >
            {t('sldMenu.edit')}
          </Menu.Item>
          {ctxResult && (
            <>
              <Menu.Divider />
              <Menu.Label>{t('sldMenu.breaker', { rating: ctxResult.breaker.ratingA })}</Menu.Label>
              {breakerOptions.map((r) => (
                <Menu.Item key={r} onClick={() => applyAndClose({ breakerOverrideA: r })}>
                  {r} A{r === ctxResult.breaker.ratingA ? ` · ${t('sldMenu.current')}` : ''}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Label>{t('sldMenu.cable', { size: ctxResult.cable.csaMm2 })}</Menu.Label>
              {cableOptions.map((s) => (
                <Menu.Item key={s} onClick={() => applyAndClose({ cableOverrideMm2: s })}>
                  {s} mm²{s === ctxResult.cable.csaMm2 ? ` · ${t('sldMenu.current')}` : ''}
                </Menu.Item>
              ))}
            </>
          )}
          <Menu.Divider />
          <Menu.Item
            onClick={() => {
              if (ctx) duplicateCircuit(ctx.panelId, ctx.circuitId);
              setCtx(null);
            }}
          >
            {t('sldMenu.duplicate')}
          </Menu.Item>
          <Menu.Item
            color="red"
            onClick={() => {
              if (ctx) removeCircuit(ctx.panelId, ctx.circuitId);
              setCtx(null);
            }}
          >
            {t('sldMenu.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Right-click a feeder cable → edit / disconnect, anchored at the cursor. */}
      <Menu opened={edgeCtx !== null} onClose={() => setEdgeCtx(null)} position="right-start" width={190} shadow="md" withinPortal>
        <Menu.Target>
          <div style={{ position: 'fixed', left: edgeCtx?.x ?? 0, top: edgeCtx?.y ?? 0, width: 1, height: 1 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t('sldMenu.feeder')}</Menu.Label>
          <Menu.Item
            onClick={() => {
              if (edgeCtx) openCircuit(edgeCtx.panelId, edgeCtx.circuitId, 'cable');
              setEdgeCtx(null);
            }}
          >
            {t('sldMenu.editCable')}
          </Menu.Item>
          <Menu.Item
            color="red"
            onClick={() => {
              if (edgeCtx) disconnectEdge(edgeCtx.panelId, edgeCtx.circuitId);
              setEdgeCtx(null);
            }}
          >
            {t('sldMenu.disconnect')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Right-click a panel → open / delete, anchored at the cursor. */}
      <Menu opened={nodeCtx !== null} onClose={() => setNodeCtx(null)} position="right-start" width={180} shadow="md" withinPortal>
        <Menu.Target>
          <div style={{ position: 'fixed', left: nodeCtx?.x ?? 0, top: nodeCtx?.y ?? 0, width: 1, height: 1 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => {
              if (nodeCtx) openInspector(nodeCtx.panelId);
              setNodeCtx(null);
            }}
          >
            {t('sldMenu.openPanel')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              setNodeCtx(null);
              if (panelId) setSettingsPanelId(panelId);
            }}
          >
            {t('sldMenu.panelSettings')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              const wasEssential = ctxPanel?.essential === true;
              setNodeCtx(null);
              if (!panelId) return;
              updatePanel(panelId, { essential: wasEssential ? undefined : true });
              notifications.show({
                message: t(wasEssential ? 'sldMenu.essentialOff' : 'sldMenu.essentialOn'),
                color: wasEssential ? 'gray' : 'teal',
              });
            }}
          >
            {t(ctxPanel?.essential ? 'sldMenu.unmarkEssential' : 'sldMenu.markEssential')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              const was = ctxPanel?.upsBacked === true;
              setNodeCtx(null);
              if (!panelId) return;
              updatePanel(panelId, { upsBacked: was ? undefined : true });
              notifications.show({
                message: t(was ? 'sldMenu.criticalOff' : 'sldMenu.criticalOn'),
                color: was ? 'gray' : 'teal',
              });
            }}
          >
            {t(ctxPanel?.upsBacked ? 'sldMenu.unmarkCritical' : 'sldMenu.markCritical')}
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              const was = ctxPanel?.submeter === true;
              setNodeCtx(null);
              if (!panelId) return;
              updatePanel(panelId, { submeter: was ? undefined : true });
              notifications.show({
                message: t(was ? 'sldMenu.submeterOff' : 'sldMenu.submeterOn'),
                color: was ? 'gray' : 'teal',
              });
            }}
          >
            {t(ctxPanel?.submeter ? 'sldMenu.removeSubmeter' : 'sldMenu.addSubmeter')}
          </Menu.Item>
          {ctxPanel?.system === '3ph' && (
            <Menu.Item
              onClick={() => {
                const panelId = nodeCtx?.panelId;
                setNodeCtx(null);
                if (panelId) autoBalance(panelId);
              }}
            >
              {t('vbuilder.autoBalance')}
            </Menu.Item>
          )}
          {ctxSpares > 0 && (
            <Menu.Item
              onClick={() => {
                const panelId = nodeCtx?.panelId;
                setNodeCtx(null);
                if (!panelId) return;
                addSpareWays(panelId, ctxSpares);
                notifications.show({
                  message: t('sldMenu.sparesAdded', { count: ctxSpares }),
                  color: 'teal',
                });
              }}
            >
              {t('sldMenu.addSpares', { count: ctxSpares })}
            </Menu.Item>
          )}
          <Menu.Item
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              setNodeCtx(null);
              if (!panelId) return;
              const name = project.panels.find((p) => p.id === panelId)?.name ?? '';
              setTplPrompt({ panelId, name });
            }}
          >
            {t('sldMenu.saveTemplate')}
          </Menu.Item>
          <Menu.Item
            color="red"
            onClick={() => {
              const panelId = nodeCtx?.panelId;
              setNodeCtx(null);
              if (!panelId) return;
              void confirmPanelDelete([panelId]).then((ok) => {
                if (!ok) return;
                removePanel(panelId);
                notifications.show({ message: t('sldMenu.panelDeleted'), color: 'gray' });
              });
            }}
          >
            {t('sldMenu.deletePanel')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Panel settings straight from the context menu (system/voltage/derating). */}
      {(() => {
        const settingsPanel = project.panels.find((p) => p.id === settingsPanelId);
        return settingsPanel ? (
          <PanelSettingsEditor
            panel={settingsPanel}
            opened
            onClose={() => setSettingsPanelId(null)}
          />
        ) : null;
      })()}

      {/* "Save as template…": name the snapshot before storing it. */}
      <Modal
        opened={tplPrompt !== null}
        onClose={() => setTplPrompt(null)}
        title={t('templateSave.title')}
        centered
        size="sm"
      >
        {tplPrompt && (
          <Stack gap="sm">
            <TextInput
              label={t('templateSave.nameLabel')}
              value={tplPrompt.name}
              data-autofocus
              onChange={(e) => setTplPrompt({ ...tplPrompt, name: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTemplate();
              }}
            />
            <Text size="xs" c="dimmed">
              {t('templateSave.hint')}
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button variant="default" size="xs" onClick={() => setTplPrompt(null)}>
                {t('templateSave.cancel')}
              </Button>
              <Button size="xs" onClick={commitTemplate}>
                {t('templateSave.save')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Deleting a panel that feeds sub-panels: confirm the cascade first. */}
      <Modal
        opened={deleteConfirm !== null}
        onClose={() => {
          deleteConfirm?.resolve(false);
          setDeleteConfirm(null);
        }}
        title={t('sldDelete.title')}
        centered
        size="md"
      >
        {deleteConfirm && (
          <Stack gap="sm">
            <Text size="sm">
              {t('sldDelete.body', {
                panel: deleteConfirm.panelNames.join(', '),
                count: deleteConfirm.childNames.length,
              })}
            </Text>
            <List size="sm" spacing={2}>
              {deleteConfirm.childNames.map((name) => (
                <List.Item key={name}>{name}</List.Item>
              ))}
            </List>
            <Text size="xs" c="dimmed">
              {t('sldDelete.undoHint')}
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  deleteConfirm.resolve(false);
                  setDeleteConfirm(null);
                }}
              >
                {t('sldDelete.cancel')}
              </Button>
              <Button
                color="red"
                size="xs"
                onClick={() => {
                  deleteConfirm.resolve(true);
                  setDeleteConfirm(null);
                }}
              >
                {t('sldDelete.confirm')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Group>
  );
}
