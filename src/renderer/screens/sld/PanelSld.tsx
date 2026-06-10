import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Box, Button, Group, Stack } from '@mantine/core';
import { IconFileVector } from '@tabler/icons-react';
import type { PanelInput, PanelResult } from '@shared/types';
import { panelSldSvg, panelSldDxf } from '@shared/drawing';
import { NODE_TYPES, type BranchNodeData } from '@renderer/screens/sld/nodes';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';
import { formatAmps } from '@renderer/lib/format';

const BRANCH_W = 160;
const BRANCH_GAP = 24;
const BUSBAR_Y = 110;
const BRANCH_Y = 200;
/** Vertical pitch between consecutive busbar sections (bar + its branch row). */
const SECTION_DY = 270;

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Width (px) a busbar bar spans for a section carrying `ways` branches. */
function sectionWidthPx(ways: number): number {
  return Math.max(ways, 1) * (BRANCH_W + BRANCH_GAP) - BRANCH_GAP;
}

/**
 * Panel single-line diagram: incomer → busbar section(s) → one node per branch
 * circuit. The panel bus splits into capacity-bounded sections (max ways / max
 * current); each section is its own bar stacked below the last, chained off the
 * previous bar's riser handle. Layout is deterministic (no async layout pass).
 */
function buildGraph(panel: PanelInput, result: PanelResult, t: TFn): { nodes: Node[]; edges: Edge[] } {
  const sections = result.busbarSections;
  const multi = sections.length > 1;
  const byId = new Map(result.circuits.map((c) => [c.circuitId, c] as const));
  const widest = Math.max(...sections.map((s) => sectionWidthPx(s.ways)), BRANCH_W);

  const nodes: Node[] = [
    {
      id: 'incomer',
      type: 'incomer',
      position: { x: widest / 2 - 90, y: 0 },
      data: {
        label: panel.name,
        ratingA: formatAmps(result.totalDemandCurrentA),
      },
      draggable: false,
    },
  ];
  const edges: Edge[] = [];

  sections.forEach((section, k) => {
    const busbarY = BUSBAR_Y + k * SECTION_DY;
    const branchY = busbarY + (BRANCH_Y - BUSBAR_Y);
    const busId = `busbar-${k}`;
    const inadequate = section.busbar.withstand ? !section.busbar.withstand.adequate : false;
    nodes.push({
      id: busId,
      type: 'busbar',
      position: { x: -10, y: busbarY },
      data: {
        label: multi ? t('vbuilder.busbarSection', { index: section.index }) : t('vbuilder.busbar'),
        ampacity: `${formatAmps(section.busbar.ampacityA)} · ${section.busbar.widthMm}×${section.busbar.thicknessMm} mm`,
        widthPx: sectionWidthPx(section.ways) + 20,
        waysLabel: multi ? t('vbuilder.waysCount', { count: section.ways }) : undefined,
        inadequate,
        manualBreak: section.manualBreak,
      },
      draggable: false,
    });
    if (k === 0) {
      edges.push({
        id: 'e-incomer-busbar-0',
        source: 'incomer',
        target: busId,
        targetHandle: 'top',
        type: 'smoothstep',
      });
    } else {
      edges.push({
        id: `e-riser-${k}`,
        source: `busbar-${k - 1}`,
        sourceHandle: 'lout',
        target: busId,
        targetHandle: 'lin',
        type: 'smoothstep',
        style: { stroke: 'var(--mantine-color-indigo-4)', strokeWidth: 2 },
      });
    }

    section.circuitIds.forEach((cid, j) => {
      const c = byId.get(cid);
      if (!c) return;
      const x = j * (BRANCH_W + BRANCH_GAP);
      const data: BranchNodeData = {
        name: c.name,
        breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
        cable: `${c.cable.csaMm2} mm²`,
        starter: c.control?.starterType.replace('_', '-'),
        warn: !c.voltageDrop.withinLimit,
        breakerOverridden: c.breaker.overridden === true,
        cableOverridden: c.cable.overridden === true,
      };
      nodes.push({ id: cid, type: 'branch', position: { x, y: branchY }, data, draggable: false });
      edges.push({
        id: `e-busbar-${cid}`,
        source: busId,
        sourceHandle: 'bottom',
        target: cid,
        type: 'smoothstep',
        style: data.warn ? { stroke: 'var(--mantine-color-red-5)' } : undefined,
      });
    });
  });

  return { nodes, edges };
}

export function PanelSld({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();
  const { nodes, edges } = useMemo(() => buildGraph(panel, result, t), [panel, result, t]);

  return (
    <Stack gap="sm">
      <Group justify="flex-end" gap="xs">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconFileVector size={14} />}
          onClick={() => downloadSvg(panel.name, panelSldSvg(panel, result))}
        >
          Export SVG
        </Button>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconFileVector size={14} />}
          onClick={() => downloadDxf(panel.name, panelSldDxf(panel, result))}
        >
          Export DXF
        </Button>
      </Group>
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
    </Stack>
  );
}
