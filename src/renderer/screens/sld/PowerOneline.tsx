import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Badge, Box, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowsExchange,
  IconBattery,
  IconBolt,
  IconBox,
  IconLock,
  IconPlugConnected,
  IconSolarPanel,
} from '@tabler/icons-react';
import { computePowerOneline } from '@shared/engine';
import type { PowerNodeKind, SystemResult } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';

const STAGE: Record<PowerNodeKind, number> = {
  utility: 0,
  generator: 0,
  pv: 0,
  battery: 0,
  transformer: 1,
  'pv-inverter': 1,
  'battery-inverter': 1,
  ats: 2,
  bus: 3,
  'main-panel': 4,
};

/** Vertical lane per node id (sources stacked; bus/main centred). */
const LANE: Record<string, number> = {
  utility: 0,
  tx: 0,
  ats: 0.5,
  gen: 1,
  pv: 2,
  pvinv: 2,
  batt: 3,
  battinv: 3,
  bus: 1.5,
  main: 1.5,
};

const COL_W = 230;
const ROW_H = 110;

const KIND_ICON: Record<PowerNodeKind, React.ReactNode> = {
  utility: <IconPlugConnected size={16} />,
  transformer: <IconBolt size={16} />,
  generator: <IconBolt size={16} />,
  ats: <IconArrowsExchange size={16} />,
  pv: <IconSolarPanel size={16} />,
  'pv-inverter': <IconBox size={16} />,
  battery: <IconBattery size={16} />,
  'battery-inverter': <IconBox size={16} />,
  bus: <IconBolt size={16} />,
  'main-panel': <IconBox size={16} />,
};

const KIND_COLOR: Record<PowerNodeKind, string> = {
  utility: 'indigo',
  transformer: 'violet',
  generator: 'orange',
  ats: 'red',
  pv: 'yellow',
  'pv-inverter': 'teal',
  battery: 'green',
  'battery-inverter': 'teal',
  bus: 'indigo',
  'main-panel': 'gray',
};

interface PowerNodeData {
  kind: PowerNodeKind;
  label: string;
  sub?: string;
  [key: string]: unknown;
}

function PowerSourceNode({ data }: NodeProps) {
  const d = data as PowerNodeData;
  if (d.kind === 'bus') {
    return (
      <Box
        style={{ width: 200, background: 'var(--mantine-color-indigo-6)', color: 'white', borderRadius: 4, padding: '6px 10px' }}
      >
        <Handle id="l" type="target" position={Position.Left} />
        <Handle id="t" type="target" position={Position.Top} />
        <Text size="xs" fw={700}>
          {d.label}
        </Text>
        {d.sub && <Text size="xs">{d.sub}</Text>}
        <Handle id="r" type="source" position={Position.Right} />
      </Box>
    );
  }
  return (
    <Paper withBorder radius="md" p="xs" shadow="xs" style={{ width: 150 }}>
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="t" type="target" position={Position.Top} />
      <Group gap={6} wrap="nowrap">
        <ThemeIcon size="sm" variant="light" color={KIND_COLOR[d.kind]}>
          {KIND_ICON[d.kind]}
        </ThemeIcon>
        <Box>
          <Text size="xs" fw={700} lineClamp={1}>
            {d.label}
          </Text>
          {d.sub && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {d.sub}
            </Text>
          )}
        </Box>
      </Group>
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
    </Paper>
  );
}

const POWER_NODE_TYPES = { power: PowerSourceNode };

/** Hybrid power one-line: sources → ATS / combiners → main bus, with interlocks. */
export function PowerOneline({ system }: { system: SystemResult }) {
  const ol = useMemo(() => computePowerOneline(system), [system]);
  const panels = useProjectStore((s) => s.project.panels);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setScreen = useProjectStore((s) => s.setScreen);

  // Double-click opens the relevant editor (consistent with the other canvases):
  // the main-panel node opens that panel; an energy-source node jumps to the
  // Energy Sources screen.
  const openForNode = (kind: PowerNodeKind) => {
    if (kind === 'main-panel') {
      const root = panels.find((p) => p.sourceType === 'utility') ?? panels[0];
      if (root) {
        setActivePanel(root.id);
        setScreen('panel');
      }
    } else if (
      kind === 'generator' ||
      kind === 'pv' ||
      kind === 'pv-inverter' ||
      kind === 'battery' ||
      kind === 'battery-inverter'
    ) {
      setScreen('sources');
    }
  };

  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = ol.nodes.map((n) => ({
      id: n.id,
      type: 'power',
      position: { x: STAGE[n.kind] * COL_W, y: (LANE[n.id] ?? 1.5) * ROW_H },
      data: { kind: n.kind, label: n.label, sub: n.sub },
      draggable: false,
      selectable: false,
    }));

    const rfEdges: Edge[] = ol.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'smoothstep',
      label: e.label,
      animated: e.label === 'mains' || e.label === 'genset' || e.label === 'AC',
    }));

    // interlock connectors (dashed, vertical) for mutual-exclusion pairs (the ATS)
    const seen = new Set<string>();
    for (const il of ol.interlocks) {
      if (il.relation !== 'mutual_exclusion') continue;
      const key = [il.aId, il.bId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const top = (LANE[il.aId] ?? 0) <= (LANE[il.bId] ?? 0) ? il.aId : il.bId;
      const bottom = top === il.aId ? il.bId : il.aId;
      const kinds = [...new Set(ol.interlocks.filter((x) => [x.aId, x.bId].sort().join('|') === key).map((x) => x.kind))];
      rfEdges.push({
        id: `il-${key}`,
        source: top,
        target: bottom,
        sourceHandle: 'b',
        targetHandle: 't',
        type: 'straight',
        label: `🔒 ${kinds.join(' + ')} interlock`,
        style: { stroke: 'var(--mantine-color-red-5)', strokeDasharray: '6 4' },
        labelStyle: { fill: 'var(--mantine-color-red-6)', fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: 'var(--mantine-color-body)' },
      });
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [ol]);

  return (
    <Stack gap="sm" pt="xs">
      <Box h={420}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={POWER_NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            // Reserve double-click for opening the editor (zoom would swallow it).
            zoomOnDoubleClick={false}
            onNodeDoubleClick={(_, node) => openForNode((node.data as PowerNodeData).kind)}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>

      {ol.interlocks.length > 0 && (
        <Stack gap={6}>
          <Group gap={6}>
            <IconLock size={14} color="var(--mantine-color-red-6)" />
            <Text size="sm" fw={600}>
              Source interlocks
            </Text>
          </Group>
          {ol.interlocks.map((il) => (
            <Group key={il.id} gap="xs" wrap="nowrap" align="flex-start">
              <Badge size="xs" variant="light" color={il.kind === 'mechanical' ? 'red' : 'orange'}>
                {il.kind}
              </Badge>
              <Text size="xs" c="dimmed">
                {il.note}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
