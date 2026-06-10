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
 * single-line drawn with IEC-style component symbols — incomer breaker → the
 * connection bus → L1/L2/L3 phase bars + sized N + PE earth bars, a breaker
 * symbol per way tapping the phase(s) it sits on, a contactor on starter
 * circuits, and a load symbol (motor / lamp / socket / sub-board / load).
 */

/* ----------------------------- schematic geometry -------------------------- */
const LEFT = 52; // gutter for the bar labels (L1/L2/L3/N/PE)
const WAY_W = 74; // horizontal pitch per outgoing way
const RIGHT_PAD = 16;
const INCOMER_Y = 8;
const INCOMER_H = 26;
const BUS_TOP_Y = 88; // y of the first (L1) phase bar
const BAR_GAP = 9; // between phase bars
const NPE_GAP = 8; // gap before the N then PE bars
const BRK_GAP = 24; // bar block → breaker symbol
const BRK_H = 20;
const STARTER_GAP = 6;
const STARTER_H = 14;
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

function panelWidth(ways: number): number {
  return Math.max(280, LEFT + Math.max(ways, 1) * WAY_W + RIGHT_PAD);
}

interface UnifiedWay {
  id: string;
  name: string;
  kind: LoadKind;
  phase: PhaseAssignment; // 'L1' | 'L2' | 'L3' | '3ph'
  breakerA: string;
  breakerClass: string; // 'MCB' | 'MCCB'
  starter?: string; // motor-starter type, when controlled
  cable: string; // compact, e.g. "4C×16"
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
  busSpec: string; // phase bus make-up
  neutralSpec: string; // neutral bar size
  peSpec: string; // PE bar size
  ways: UnifiedWay[];
  feederIds: string[];
  issues?: NodeIssue[];
  [key: string]: unknown;
}

/* -------------------------------- symbols ---------------------------------- */
/* Each glyph draws around a vertical conductor at `cx`, starting at `top`. */

/** Circuit breaker (IEC): in-line conductor, open contact, thermal-magnetic box. */
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

/** Pick the end-of-way load symbol for a circuit. */
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

/* --------------------------- internal single-line -------------------------- */

/** The bars present on this panel, top→bottom, with their y. */
function barLayout(threePhase: boolean): { key: string; y: number }[] {
  const out: { key: string; y: number }[] = [];
  const phases = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  phases.forEach((k, i) => out.push({ key: k, y: BUS_TOP_Y + i * BAR_GAP }));
  const nY = BUS_TOP_Y + phases.length * BAR_GAP + NPE_GAP;
  out.push({ key: 'N', y: nY });
  out.push({ key: 'PE', y: nY + NPE_GAP });
  return out;
}

function brkTopY(threePhase: boolean): number {
  return barLayout(threePhase).at(-1)!.y + BRK_GAP;
}
const starterTopY = (b: number) => b + BRK_H + STARTER_GAP;
const loadTopY = (b: number) => starterTopY(b) + STARTER_H + LOAD_GAP;

function schematicHeight(threePhase: boolean): number {
  return loadTopY(brkTopY(threePhase)) + LOAD_H + CABLE_GAP + 12;
}

function PanelSchematic({ d, width }: { d: UnifiedPanelData; width: number }) {
  const threePhase = d.system === '3ph';
  const bars = barLayout(threePhase);
  const barY = (k: string) => bars.find((b) => b.key === k)?.y ?? BUS_TOP_Y;
  const phaseKeys = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  const brkTop = brkTopY(threePhase);
  const starterTop = starterTopY(brkTop);
  const loadTop = loadTopY(brkTop);
  const cableY = loadTop + LOAD_H + CABLE_GAP;
  const right = width - RIGHT_PAD;
  const height = schematicHeight(threePhase);
  const tailX = LEFT + 16;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Incomer + main breaker on the connection bus */}
      <rect x={LEFT} y={INCOMER_Y} width={150} height={INCOMER_H} rx={4} fill="var(--mantine-color-indigo-light)" stroke="var(--mantine-color-indigo-5)" />
      <text x={LEFT + 8} y={INCOMER_Y + 17} fontSize={10} fontWeight={700} fill={FG}>
        {d.incomer}
      </text>
      <line x1={tailX} y1={INCOMER_Y + INCOMER_H} x2={tailX} y2={barY('N')} stroke={DIM} strokeWidth={2} />
      {breaker(tailX, INCOMER_Y + INCOMER_H + 4, 'var(--mantine-color-indigo-6)')}
      <text x={tailX + 12} y={INCOMER_Y + INCOMER_H + 18} fontSize={8.5} fill={DIM}>
        bus: {d.busSpec}
      </text>

      {/* Phase / N / PE bars — N and PE labelled with their sized cross-section */}
      {bars.map((b) => (
        <g key={b.key}>
          <line
            x1={LEFT}
            y1={b.y}
            x2={right}
            y2={b.y}
            stroke={PHASE_COLOR[b.key] ?? '#888'}
            strokeWidth={b.key === 'PE' || b.key === 'N' ? 2 : 3}
            strokeDasharray={b.key === 'PE' ? '4 2' : undefined}
          />
          <text x={6} y={b.y + 3} fontSize={8.5} fontWeight={700} fill={PHASE_COLOR[b.key] ?? '#888'}>
            {b.key}
          </text>
          {b.key === 'N' && (
            <text x={right} y={b.y - 2} fontSize={7.5} textAnchor="end" fill={PHASE_COLOR.N}>
              {d.neutralSpec}
            </text>
          )}
          {b.key === 'PE' && (
            <text x={right} y={b.y - 2} fontSize={7.5} textAnchor="end" fill={PHASE_COLOR.PE}>
              {d.peSpec}
            </text>
          )}
        </g>
      ))}

      {/* One column per outgoing way */}
      {d.ways.map((w, i) => {
        const cx = LEFT + i * WAY_W + WAY_W / 2;
        const taps = w.phase === '3ph' ? phaseKeys : [w.phase];
        return (
          <g key={w.id}>
            <title>{`${w.name} — ${w.breakerClass} ${w.breakerA}${w.starter ? ` · ${w.starter}` : ''}, ${w.cableFull}${w.feeds ? ` → ${w.feeds}` : ''}`}</title>
            {/* phase tap(s) to the breaker */}
            {taps.map((k, j) => {
              const ox = cx + (taps.length > 1 ? (j - 1) * 5 : 0);
              return <line key={k} x1={ox} y1={barY(k)} x2={ox} y2={brkTop} stroke={PHASE_COLOR[k] ?? '#888'} strokeWidth={1.6} />;
            })}
            {/* neutral (1-ph) + PE taps */}
            {w.phase !== '3ph' && (
              <line x1={cx + 8} y1={barY('N')} x2={cx + 8} y2={brkTop} stroke={PHASE_COLOR.N} strokeWidth={1} strokeDasharray="2 2" />
            )}
            <line x1={cx + 12} y1={barY('PE')} x2={cx + 12} y2={loadTop + LOAD_H} stroke={PHASE_COLOR.PE} strokeWidth={1} strokeDasharray="2 2" />
            {/* main conductor through the column */}
            <line x1={cx} y1={brkTop + BRK_H} x2={cx} y2={loadTop} stroke={FG} strokeWidth={1.1} />
            {/* breaker */}
            {breaker(cx, brkTop, w.warn ? 'var(--mantine-color-red-6)' : FG)}
            <text x={cx + 9} y={brkTop + 13} fontSize={8} fill={DIM}>
              {w.breakerA}
            </text>
            {/* contactor on starter circuits */}
            {w.starter && contactor(cx, starterTop)}
            {w.starter && (
              <text x={cx + 9} y={starterTop + 11} fontSize={7} fill={DIM}>
                {w.starter.replace('_', '-')}
              </text>
            )}
            {/* cable marker on the run + load symbol */}
            <line x1={cx - 3} y1={loadTop - 3} x2={cx + 3} y2={loadTop - 9} stroke={FG} strokeWidth={1} />
            {loadSymbol(cx, loadTop, w, threePhase)}
            {/* outgoing cable size — clearly shown */}
            <text x={cx} y={cableY} fontSize={9} fontWeight={700} textAnchor="middle" fill={FG}>
              {w.cable}
            </text>
            {w.feeds && (
              <text x={cx} y={cableY + 10} fontSize={8} fontWeight={700} textAnchor="middle" fill={PHASE_COLOR.L3}>
                → {w.feeds}
              </text>
            )}
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
  const width = panelWidth(d.ways.length);
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

  const rowPitch =
    Math.max(...project.panels.map((p) => schematicHeight(p.system === '3ph')), 120) + 150;

  const nodes: Node[] = [];
  for (const [d, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const widths = ids.map((id) => panelWidth(system.panels[id]?.circuits.length ?? 0));
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
        return {
          id: c.circuitId,
          name: c.name,
          kind: ci?.loadKind ?? 'general',
          phase: c.phase,
          breakerA: `${c.breaker.ratingA}A`,
          breakerClass: c.breaker.deviceClass,
          ...(c.control ? { starter: c.control.starterType } : {}),
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
