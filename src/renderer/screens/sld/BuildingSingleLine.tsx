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
import type { PhaseAssignment, ProjectInput, SystemResult } from '@shared/types';
import { formatAmps, formatKw } from '@renderer/lib/format';
import { toNodeIssues } from '@renderer/lib/nodeIssues';
import { NodeIssues, type NodeIssue } from '@renderer/screens/sld/nodes';
import { useProjectStore } from '@renderer/state/projectStore';

/**
 * Unified building single-line: every panel on ONE canvas. Zoomed out, a panel
 * is a summary card (name + load); zoom in and it separates into a real internal
 * single-line — incomer (MCCB) → the connection bus → L1/L2/L3 phase bars + N +
 * PE earth bar, with a drawn tap from each MCB to the phase(s) it sits on and the
 * outgoing cable make-up labelled per way. Feeders run from the specific feeding
 * MCB to the child panel. Semantic zoom is driven by the live viewport scale.
 */

/* ----------------------------- schematic geometry -------------------------- */
const LEFT = 48; // gutter for the bar labels (L1/L2/L3/N/PE)
const WAY_W = 68; // horizontal pitch per outgoing way
const RIGHT_PAD = 14;
const INCOMER_Y = 8;
const INCOMER_H = 26;
const BUS_TOP_Y = 84; // y of the first (L1) phase bar
const BAR_GAP = 9; // between phase bars
const NPE_GAP = 8; // gap before the N then PE bars
const MCB_TOP_GAP = 24; // bar block → MCB boxes
const MCB_H = 20;
const MCB_W = 46;
const CABLE_GAP = 12; // MCB → cable label

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
  phase: PhaseAssignment; // 'L1' | 'L2' | 'L3' | '3ph'
  breakerA: string;
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
  busSpec: string; // bus connection make-up
  ways: UnifiedWay[];
  feederIds: string[];
  issues?: NodeIssue[];
  [key: string]: unknown;
}

/** The bars present on this panel, top→bottom, with their y and colour. */
function barLayout(threePhase: boolean): { key: string; y: number }[] {
  const out: { key: string; y: number }[] = [];
  const phases = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  phases.forEach((k, i) => out.push({ key: k, y: BUS_TOP_Y + i * BAR_GAP }));
  const nY = BUS_TOP_Y + phases.length * BAR_GAP + NPE_GAP;
  out.push({ key: 'N', y: nY });
  out.push({ key: 'PE', y: nY + NPE_GAP });
  return out;
}

function mcbTopY(threePhase: boolean): number {
  const bars = barLayout(threePhase);
  return bars[bars.length - 1]!.y + MCB_TOP_GAP;
}

function schematicHeight(threePhase: boolean): number {
  return mcbTopY(threePhase) + MCB_H + CABLE_GAP + 14;
}

/** The drawn internal single-line for one panel (zoomed-in detail). */
function PanelSchematic({ d, width }: { d: UnifiedPanelData; width: number }) {
  const threePhase = d.system === '3ph';
  const bars = barLayout(threePhase);
  const barY = (k: string) => bars.find((b) => b.key === k)?.y ?? BUS_TOP_Y;
  const phaseKeys = threePhase ? ['L1', 'L2', 'L3'] : ['L'];
  const mcbY = mcbTopY(threePhase);
  const right = width - RIGHT_PAD;
  const height = schematicHeight(threePhase);
  const incomerTailX = LEFT + 16;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Incomer (MCCB) */}
      <rect x={LEFT} y={INCOMER_Y} width={158} height={INCOMER_H} rx={4} fill="var(--mantine-color-indigo-light)" stroke="var(--mantine-color-indigo-5)" />
      <text x={LEFT + 8} y={INCOMER_Y + 17} fontSize={10} fontWeight={700} fill="var(--mantine-color-text)">
        {d.incomer}
      </text>
      {/* Connection bus from the incomer down to the bars, labelled with its make-up */}
      <line x1={incomerTailX} y1={INCOMER_Y + INCOMER_H} x2={incomerTailX} y2={barY('N')} stroke="var(--mantine-color-dimmed)" strokeWidth={2} />
      <text x={incomerTailX + 6} y={INCOMER_Y + INCOMER_H + 16} fontSize={8.5} fill="var(--mantine-color-dimmed)">
        bus: {d.busSpec}
      </text>

      {/* Phase / N / PE bars */}
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
        </g>
      ))}

      {/* One column per outgoing way: taps from its phase(s) + N + PE to its MCB */}
      {d.ways.map((w, i) => {
        const cx = LEFT + i * WAY_W + WAY_W / 2;
        const taps = w.phase === '3ph' ? phaseKeys : [w.phase];
        return (
          <g key={w.id}>
            <title>{`${w.name} — ${w.breakerA}, ${w.cableFull}${w.feeds ? ` → ${w.feeds}` : ''}`}</title>
            {/* phase tap(s) */}
            {taps.map((k, j) => {
              const ox = cx + (taps.length > 1 ? (j - 1) * 5 : 0);
              return (
                <line key={k} x1={ox} y1={barY(k)} x2={ox} y2={mcbY} stroke={PHASE_COLOR[k] ?? '#888'} strokeWidth={1.6} />
              );
            })}
            {/* neutral tap (single-phase loads) + PE tap (all) */}
            {w.phase !== '3ph' && (
              <line x1={cx + 7} y1={barY('N')} x2={cx + 7} y2={mcbY} stroke={PHASE_COLOR.N} strokeWidth={1} strokeDasharray="2 2" />
            )}
            <line x1={cx + 11} y1={barY('PE')} x2={cx + 11} y2={mcbY + MCB_H} stroke={PHASE_COLOR.PE} strokeWidth={1} strokeDasharray="2 2" />
            {/* MCB */}
            <rect
              x={cx - MCB_W / 2}
              y={mcbY}
              width={MCB_W}
              height={MCB_H}
              rx={3}
              fill="var(--mantine-color-body)"
              stroke={w.warn ? 'var(--mantine-color-red-5)' : w.feeds ? 'var(--mantine-color-indigo-5)' : 'var(--mantine-color-default-border)'}
              strokeWidth={w.feeds || w.warn ? 1.6 : 1}
            />
            <text x={cx} y={mcbY + 13} fontSize={9} fontWeight={600} textAnchor="middle" fill="var(--mantine-color-text)">
              {w.breakerA}
            </text>
            {/* outgoing cable make-up */}
            <text x={cx} y={mcbY + MCB_H + CABLE_GAP} fontSize={7.5} textAnchor="middle" fill="var(--mantine-color-dimmed)">
              {w.cable}
            </text>
            {w.feeds && (
              <text x={cx} y={mcbY + MCB_H + CABLE_GAP + 9} fontSize={7.5} fontWeight={700} textAnchor="middle" fill={PHASE_COLOR.L3}>
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

      {/* One source handle per feeder way, positioned under its MCB column. */}
      {d.feederIds.map((id) => {
        const idx = feederIndex(id);
        const left = expanded ? LEFT + idx * WAY_W + WAY_W / 2 : 24;
        return <Handle key={id} type="source" id={id} position={Position.Bottom} style={{ left }} />;
      })}
    </Box>
  );
}

const UNIFIED_NODE_TYPES = { uPanel: UnifiedPanelNode };

/** Compact outgoing-cable make-up, e.g. "2×(4C×95)". */
function cableLabel(csaMm2: number, cores: number, runs?: number): string {
  const core = `${cores}C×${csaMm2}`;
  return runs && runs > 1 ? `${runs}×(${core})` : core;
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

  // Row pitch tall enough for the deepest-detail panel; column pitch per-row uses
  // each panel's own expanded width so wide (many-way) panels don't overlap.
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
      const ways: UnifiedWay[] = res.circuits.map((c) => {
        const childId = feederWayToChild.get(c.circuitId);
        const child = childId ? byId.get(childId) : undefined;
        return {
          id: c.circuitId,
          name: c.name,
          phase: c.phase,
          breakerA: `${c.breaker.ratingA}A`,
          cable: cableLabel(c.cable.csaMm2, c.grounding.cores, c.cable.runsPerPhase),
          cableFull: c.grounding.cableSpec,
          feeds: child ? (child.tag ?? child.name) : undefined,
          warn: !c.voltageDrop.withinLimit,
        };
      });
      const busSpec =
        res.busbar.widthMm > 0
          ? `${res.busbar.widthMm}×${res.busbar.thicknessMm} mm Cu (${formatAmps(res.busbar.ampacityA)})`
          : `${res.busbar.csaMm2} mm² (${formatAmps(res.busbar.ampacityA)})`;
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
    edges.push({
      id: `feed-${circuitId}`,
      source: parentId,
      sourceHandle: circuitId,
      target: childId,
      targetHandle: 'in',
      type: 'smoothstep',
      label: feederWay ? `${feederWay.breaker.ratingA}A` : undefined,
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
