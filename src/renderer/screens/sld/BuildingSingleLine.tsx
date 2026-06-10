import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Badge, Box, Group, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import type { LoadKind, PhaseAssignment, ProjectInput, SystemResult } from '@shared/types';
import { formatAmps, formatKw } from '@renderer/lib/format';
import { toNodeIssues } from '@renderer/lib/nodeIssues';
import { NodeIssues, type NodeIssue } from '@renderer/screens/sld/nodes';
import { useProjectStore } from '@renderer/state/projectStore';

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
const WAY_W = 76; // horizontal pitch per outgoing way / bus-tapped device
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
const LOAD_GAP = 10;
const LOAD_H = 24;
const CABLE_GAP = 11;

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

interface SupplyHead {
  transformer?: string; // "630 kVA"
  generator?: boolean;
  ats?: boolean;
  meter?: string; // "kWh" or "CT 300/5"
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
  busSpec: string;
  neutralSpec: string;
  peSpec: string;
  ways: UnifiedWay[];
  bus: BusDevice[]; // bus-tapped equipment (SPD / capacitor) — root panel
  supply?: SupplyHead; // service-entrance equipment — root panel
  feederIds: string[];
  issues?: NodeIssue[];
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
  loadTop: number;
  cableY: number;
  height: number;
}

/** Vertical layout — RCD / starter bands are reserved only when the panel uses
 * them, so every way's load + cable label stays aligned. */
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
  const loadTop = y + LOAD_GAP;
  const cableY = loadTop + LOAD_H + CABLE_GAP;
  return { bars, brkTop, rcdTop, starterTop, loadTop, cableY, height: cableY + 12 };
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
        return (
          <g key={b.key}>
            <rect x={3} y={b.y - 6} width={LEFT - 12} height={12} rx={6} fill={color} />
            <text x={3 + (LEFT - 12) / 2} y={b.y + 3} fontSize={8} fontWeight={700} textAnchor="middle" fill="#fff">
              {b.key}
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
        return (
          <g key={w.id}>
            <title>{`${w.name} — ${w.breakerClass} ${w.breakerA}${w.rcd ? ' + RCD' : ''}${w.starter ? ` · ${w.starter}` : ''}, ${w.cableFull}${w.feeds ? ` → ${w.feeds}` : ''}`}</title>
            {taps.map((k, j) => {
              const ox = cx + (taps.length > 1 ? (j - 1) * 5 : 0);
              return <line key={k} x1={ox} y1={barY(k)} x2={ox} y2={L.brkTop} stroke={PHASE_COLOR[k] ?? '#888'} strokeWidth={1.6} />;
            })}
            {w.phase !== '3ph' && (
              <line x1={cx + 8} y1={barY('N')} x2={cx + 8} y2={L.brkTop} stroke={PHASE_COLOR.N} strokeWidth={1} strokeDasharray="2 2" />
            )}
            <line x1={cx + 12} y1={barY('PE')} x2={cx + 12} y2={L.loadTop + LOAD_H} stroke={PHASE_COLOR.PE} strokeWidth={1} strokeDasharray="2 2" />
            <line x1={cx} y1={L.brkTop + BRK_H} x2={cx} y2={L.loadTop} stroke={FG} strokeWidth={1.1} />
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
            <line x1={cx - 3} y1={L.loadTop - 3} x2={cx + 3} y2={L.loadTop - 9} stroke={FG} strokeWidth={1} />
            {loadSymbol(cx, L.loadTop, w, threePhase)}
            <text x={cx} y={L.cableY} fontSize={9} fontWeight={700} textAnchor="middle" fill={FG}>
              {w.cable}
            </text>
            {w.feeds && (
              <text x={cx} y={L.cableY + 10} fontSize={8} fontWeight={700} textAnchor="middle" fill={PHASE_COLOR.L3}>
                → {w.feeds}
              </text>
            )}
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

/** A panel that renders summary-or-detail from the current viewport zoom. */
function UnifiedPanelNode({ data }: NodeProps) {
  const d = data as UnifiedPanelData;
  const { zoom } = useViewport();
  const expanded = zoom >= 0.72;
  const width = panelWidth(d.ways.length, d.bus.length);
  const hasError = (d.issues ?? []).some((i) => i.severity === 'error');
  const feederIndex = (id: string) => d.ways.findIndex((w) => w.id === id);

  return (
    <Box
      style={{
        width,
        background: 'var(--mantine-color-body)',
        border: `1px solid ${hasError ? 'var(--mantine-color-red-5)' : 'var(--mantine-color-default-border)'}`,
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: 'var(--mantine-shadow-sm)',
        padding: 10,
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
          <NodeIssues issues={d.issues} />
          <Badge size="xs" variant="light" color={d.source === 'utility' ? 'indigo' : 'gray'}>
            {d.source}
          </Badge>
        </Group>
      </Group>

      {/* Keyed so the view remounts when the LOD flips — the sld-lod-enter
          animation then cross-dissolves summary ⇄ detail instead of snapping. */}
      <Box key={expanded ? 'detail' : 'summary'} className="sld-lod-enter">
        {!expanded ? (
          <Group justify="space-between" mt={6}>
            <Text size="xs" c="dimmed">
              {d.incomerA} · {d.ways.length} ways
            </Text>
            <Text size="sm" fw={700}>
              {d.loadKw}
            </Text>
          </Group>
        ) : (
          <Box mt={4} style={{ overflow: 'hidden' }}>
            <PanelSchematic d={d} width={width - 20} />
          </Box>
        )}
      </Box>

      {d.feederIds.map((id) => {
        const idx = feederIndex(id);
        const left = expanded ? LEFT + idx * WAY_W + WAY_W / 2 : 24;
        return <Handle key={id} type="source" id={id} position={Position.Bottom} style={{ left }} />;
      })}
    </Box>
  );
}

const UNIFIED_NODE_TYPES = { uPanel: UnifiedPanelNode };

/** Outgoing-cable size, e.g. "4×16 mm²" or "2×(4×95) mm²" for parallel runs. */
function cableLabel(csaMm2: number, cores: number, runs?: number): string {
  return runs && runs > 1 ? `${runs}×(${cores}×${csaMm2}) mm²` : `${cores}×${csaMm2} mm²`;
}

const THERMAL_OVERLOAD_STARTERS = new Set(['DOL', 'STAR_DELTA', 'REVERSING', 'PUMP']);

function buildUnified(project: ProjectInput, system: SystemResult): { nodes: Node[]; edges: Edge[] } {
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

  // Bus / supply equipment lives at the service-entrance (root) panel.
  const rootId = project.panels.find((p) => p.sourceType === 'utility')?.id;
  const threePh = (id: string) => byId.get(id)?.system === '3ph';
  const busDevicesFor = (id: string): BusDevice[] => {
    if (id !== rootId) return [];
    const out: BusDevice[] = [];
    if (system.spd?.recommended) out.push({ kind: 'spd', label: system.spd.type, threePhase: threePh(id) });
    if (system.powerFactor.needed && system.powerFactor.bankKvar > 0) {
      out.push({ kind: 'cap', label: `${system.powerFactor.bankKvar} kvar`, threePhase: threePh(id) });
    }
    return out;
  };
  const supplyFor = (id: string): SupplyHead | undefined => {
    if (id !== rootId) return undefined;
    const head: SupplyHead = {};
    if (system.supply.type === 'MV' && system.supply.transformerKva) head.transformer = `${system.supply.transformerKva} kVA`;
    if (system.sources?.generator) {
      head.generator = true;
      head.ats = true;
    }
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
    Math.max(...project.panels.filter((p) => system.panels[p.id]).map((p) => heightFor(p.id)), 120) + 150;

  const nodes: Node[] = [];
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
          cable: cableLabel(c.cable.csaMm2, c.grounding.cores, c.cable.runsPerPhase),
          cableFull: c.grounding.cableSpec,
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
        busSpec,
        neutralSpec: bus.neutralCsaMm2 ? `${bus.neutralCsaMm2} mm²` : '—',
        peSpec: bus.peCsaMm2 ? `${bus.peCsaMm2} mm²` : '—',
        ways,
        bus: busDevicesFor(id),
        ...(supply ? { supply } : {}),
        feederIds: ways.filter((wy) => wy.feeds).map((wy) => wy.id),
        issues: toNodeIssues(res.warnings),
      };
      nodes.push({ id, type: 'uPanel', position: { x, y: d * rowPitch }, data, draggable: false });
      x += w + GAP;
    });
  }

  const edges: Edge[] = [];
  for (const [circuitId, childId] of feederWayToChild) {
    const parentId = parentOf.get(childId);
    if (!parentId || !system.panels[childId] || !system.panels[parentId]) continue;
    const feederWay = system.panels[parentId]?.circuits.find((c) => c.circuitId === circuitId);
    const feederLabel = feederWay
      ? `${feederWay.breaker.ratingA}A · ${cableLabel(feederWay.cable.csaMm2, feederWay.grounding.cores, feederWay.cable.runsPerPhase)}`
      : undefined;
    edges.push({
      id: `feed-${circuitId}`,
      source: parentId,
      sourceHandle: circuitId,
      target: childId,
      targetHandle: 'in',
      type: 'smoothstep',
      label: feederLabel,
      labelStyle: { fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: 'var(--mantine-color-body)' },
      style: { stroke: 'var(--mantine-color-indigo-4)', strokeWidth: 2 },
    });
  }

  return { nodes, edges };
}

export function BuildingSingleLine({ system }: { system: SystemResult }) {
  const project = useProjectStore((s) => s.project);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setScreen = useProjectStore((s) => s.setScreen);
  const { nodes, edges } = useMemo(() => buildUnified(project, system), [project, system]);

  return (
    <Box h={560}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={UNIFIED_NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2.5}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeDoubleClick={(_, node) => {
            setActivePanel(node.id);
            setScreen('panel');
          }}
        >
          <Background gap={18} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </Box>
  );
}
