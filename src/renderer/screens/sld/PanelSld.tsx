import { useMemo } from 'react';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Box } from '@mantine/core';
import type { PanelInput, PanelResult } from '@shared/types';
import { NODE_TYPES, type BranchNodeData } from '@renderer/screens/sld/nodes';
import { formatAmps } from '@renderer/lib/format';

const BRANCH_W = 160;
const BRANCH_GAP = 24;
const BUSBAR_Y = 110;
const BRANCH_Y = 200;

/**
 * Panel single-line diagram: incomer → busbar bar → one node per branch circuit.
 * Layout is a simple fixed three-row arrangement (incomer, busbar, branches) so
 * it stays deterministic and needs no async layout pass.
 */
function buildGraph(panel: PanelInput, result: PanelResult): { nodes: Node[]; edges: Edge[] } {
  const branches = result.circuits;
  const totalWidth = Math.max(branches.length, 1) * (BRANCH_W + BRANCH_GAP) - BRANCH_GAP;
  const busbarCenterX = totalWidth / 2;

  const nodes: Node[] = [
    {
      id: 'incomer',
      type: 'incomer',
      position: { x: busbarCenterX - 90, y: 0 },
      data: {
        label: panel.name,
        ratingA: formatAmps(result.totalDemandCurrentA),
      },
      draggable: false,
    },
    {
      id: 'busbar',
      type: 'busbar',
      position: { x: busbarCenterX - 310, y: BUSBAR_Y },
      data: {
        label: 'Busbar',
        ampacity: `${formatAmps(result.busbar.ampacityA)} · ${result.busbar.widthMm}×${result.busbar.thicknessMm} mm`,
      },
      draggable: false,
    },
  ];

  const edges: Edge[] = [
    {
      id: 'e-incomer-busbar',
      source: 'incomer',
      target: 'busbar',
      type: 'smoothstep',
    },
  ];

  branches.forEach((c, i) => {
    const x = i * (BRANCH_W + BRANCH_GAP);
    const data: BranchNodeData = {
      name: c.name,
      breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
      cable: `${c.cable.csaMm2} mm²`,
      starter: c.control?.starterType.replace('_', '-'),
      warn: !c.voltageDrop.withinLimit,
    };
    nodes.push({
      id: c.circuitId,
      type: 'branch',
      position: { x, y: BRANCH_Y },
      data,
      draggable: false,
    });
    edges.push({
      id: `e-busbar-${c.circuitId}`,
      source: 'busbar',
      target: c.circuitId,
      type: 'smoothstep',
      style: data.warn ? { stroke: 'var(--mantine-color-red-5)' } : undefined,
    });
  });

  return { nodes, edges };
}

export function PanelSld({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { nodes, edges } = useMemo(() => buildGraph(panel, result), [panel, result]);

  return (
    <Box h={440} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </Box>
  );
}
