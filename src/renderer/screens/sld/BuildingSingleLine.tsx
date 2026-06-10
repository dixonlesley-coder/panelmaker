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
import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { IconPlugConnected, IconSitemap } from '@tabler/icons-react';
import type { ProjectInput, SystemResult } from '@shared/types';
import { formatAmps, formatKw } from '@renderer/lib/format';
import { toNodeIssues } from '@renderer/lib/nodeIssues';
import { NodeIssues, type NodeIssue } from '@renderer/screens/sld/nodes';
import { useProjectStore } from '@renderer/state/projectStore';

/**
 * Unified building single-line: every panel on ONE canvas. Zoomed out, a panel
 * is a summary card (name + load); zoom in and it separates into its components
 * (incomer, busbar, MCB ways), with each feeder drawn from the specific MCB that
 * feeds its sub-panel. Semantic zoom is driven by the live viewport scale.
 */

const NODE_W = 280;
const WAY_H = 24;
const COL_GAP = 80;
const ROW_GAP = 110;
/** Below this viewport zoom a panel collapses to its summary card. */
const LOD_ZOOM = 0.72;
/** Estimated expanded height, used for non-overlapping layout. */
function expandedHeight(ways: number): number {
  return 58 /* header */ + 24 /* incomer */ + 22 /* busbar */ + Math.max(ways, 1) * WAY_H + 22;
}

interface UnifiedWay {
  id: string;
  name: string;
  breaker: string;
  cable: string;
  /** Sub-panel this way feeds, when it's a feeder. */
  feeds?: string;
  warn: boolean;
}

interface UnifiedPanelData {
  panelId: string;
  name: string;
  tag?: string;
  source: string;
  loadKw: string;
  incomerA: string;
  incomer: string;
  busbar: string;
  ways: UnifiedWay[];
  /** Circuit ids of ways that feed sub-panels (one source handle each). */
  feederIds: string[];
  issues?: NodeIssue[];
  [key: string]: unknown;
}

/** A panel that renders summary-or-detail from the current viewport zoom. */
function UnifiedPanelNode({ data }: NodeProps) {
  const d = data as UnifiedPanelData;
  const { zoom } = useViewport();
  const expanded = zoom >= LOD_ZOOM;
  const hasError = (d.issues ?? []).some((i) => i.severity === 'error');
  return (
    <Box
      style={{
        width: NODE_W,
        background: 'var(--mantine-color-body)',
        border: `1px solid ${hasError ? 'var(--mantine-color-red-5)' : 'var(--mantine-color-default-border)'}`,
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: 'var(--mantine-shadow-sm)',
        padding: 10,
      }}
    >
      <Handle type="target" position={Position.Top} id="in" />

      {/* Header — always visible */}
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
        /* Summary */
        <Group justify="space-between" mt={6}>
          <Text size="xs" c="dimmed">
            {d.incomerA} · {d.ways.length} ways
          </Text>
          <Text size="sm" fw={700}>
            {d.loadKw}
          </Text>
        </Group>
      ) : (
        /* Detail: incomer → busbar → ways */
        <Box mt={6}>
          <Group justify="space-between" gap={4}>
            <Text size="xs" c="dimmed">
              Incomer · {d.incomer}
            </Text>
            <Text size="xs" fw={600}>
              {d.incomerA} · {d.loadKw}
            </Text>
          </Group>
          <Box
            mt={4}
            mb={4}
            style={{
              background: 'var(--mantine-color-indigo-6)',
              color: 'white',
              borderRadius: 3,
              padding: '2px 8px',
            }}
          >
            <Text size="xs" fw={600}>
              Bus · {d.busbar}
            </Text>
          </Box>
          <Stack gap={2}>
            {d.ways.map((w) => (
              <Group
                key={w.id}
                justify="space-between"
                wrap="nowrap"
                gap={6}
                style={{
                  height: WAY_H,
                  borderLeft: `2px solid ${w.warn ? 'var(--mantine-color-red-5)' : w.feeds ? 'var(--mantine-color-indigo-4)' : 'var(--mantine-color-gray-4)'}`,
                  paddingLeft: 6,
                }}
              >
                <Text size="xs" lineClamp={1} style={{ minWidth: 0 }} title={w.name}>
                  {w.name}
                </Text>
                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Text size="xs" c="dimmed">
                    {w.breaker}
                  </Text>
                  {w.feeds && <IconSitemap size={11} color="var(--mantine-color-indigo-5)" />}
                </Group>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {/* One source handle per feeder way (stacked along the bottom) — present in
          both LOD modes so the feeder edges always resolve. */}
      {d.feederIds.map((id, i) => (
        <Handle
          key={id}
          type="source"
          id={id}
          position={Position.Bottom}
          style={{ left: 24 + i * 22 }}
        />
      ))}
    </Box>
  );
}

const UNIFIED_NODE_TYPES = { uPanel: UnifiedPanelNode };

function buildUnified(
  project: ProjectInput,
  system: SystemResult,
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  // Parent map + feeder way per child, from the project's feeder cross-links.
  const parentOf = new Map<string, string>();
  const feederWayToChild = new Map<string, string>(); // circuitId -> childPanelId
  for (const p of project.panels) {
    for (const c of p.circuits) {
      if (c.feedsPanelId) {
        parentOf.set(c.feedsPanelId, p.id);
        feederWayToChild.set(c.id, c.feedsPanelId);
      }
    }
  }

  // Depth from a root (panel with no parent).
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const parent = parentOf.get(id);
    const d = parent ? depthOf(parent) + 1 : 0;
    depth.set(id, d);
    return d;
  };

  const rows = new Map<number, string[]>();
  for (const p of project.panels) {
    if (!system.panels[p.id]) continue;
    const d = depthOf(p.id);
    (rows.get(d) ?? rows.set(d, []).get(d)!).push(p.id);
  }

  // Row pitch: tall enough for the deepest-detail panel in any row.
  const rowPitch =
    Math.max(
      ...project.panels.map((p) => expandedHeight(system.panels[p.id]?.circuits.length ?? 0)),
      120,
    ) + ROW_GAP;
  const colPitch = NODE_W + COL_GAP;

  const nodes: Node[] = [];
  for (const [d, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = ids.length * colPitch - COL_GAP;
    ids.forEach((id, i) => {
      const panel = byId.get(id);
      const res = system.panels[id];
      if (!panel || !res) return;
      const ways: UnifiedWay[] = res.circuits.map((c) => {
        const childId = feederWayToChild.get(c.circuitId);
        const child = childId ? byId.get(childId) : undefined;
        return {
          id: c.circuitId,
          name: c.name,
          breaker: `${c.breaker.ratingA}A`,
          cable: `${c.cable.csaMm2} mm²`,
          feeds: child ? (child.tag ?? child.name) : undefined,
          warn: !c.voltageDrop.withinLimit,
        };
      });
      const data: UnifiedPanelData = {
        panelId: id,
        name: res.name,
        ...(panel.tag ? { tag: panel.tag } : {}),
        source: panel.sourceType,
        loadKw: formatKw(res.totalConnectedLoadW),
        incomerA: formatAmps(res.totalDemandCurrentA),
        incomer: `${res.incomer.breaker.deviceClass} ${res.incomer.breaker.ratingA}A`,
        busbar: `${formatAmps(res.busbar.ampacityA)} · ${res.busbar.csaMm2} mm²`,
        ways,
        feederIds: ways.filter((w) => w.feeds).map((w) => w.id),
        issues: toNodeIssues(res.warnings),
      };
      nodes.push({
        id,
        type: 'uPanel',
        position: { x: i * colPitch - rowWidth / 2, y: d * rowPitch },
        data,
        draggable: false,
      });
    });
  }

  const edges: Edge[] = [];
  for (const [circuitId, childId] of feederWayToChild) {
    const parentId = parentOf.get(childId);
    if (!parentId || !system.panels[childId] || !system.panels[parentId]) continue;
    // Label the connector with the feeding MCB so it reads even when zoomed out.
    const parentRes = system.panels[parentId];
    const feederWay = parentRes?.circuits.find((c) => c.circuitId === circuitId);
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
