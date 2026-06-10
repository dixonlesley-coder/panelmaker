import { useMemo, useState } from 'react';
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
import { circuitIssues, incomerIssues, busbarIssues } from '@renderer/lib/nodeIssues';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';
import { formatAmps } from '@renderer/lib/format';
import { CircuitEditor } from '@renderer/features/builder/CircuitEditor';
import { PanelSettingsEditor } from '@renderer/features/builder/PanelSettingsEditor';

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
 * current); each section is its own bar stacked below the last, fed radially
 * from the incomer. Layout is deterministic (no async layout pass).
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
        ratingA: `${result.incomer.breaker.deviceClass} ${result.incomer.breaker.ratingA}A ${result.incomer.poles}P · ${formatAmps(result.totalDemandCurrentA)}`,
        issues: incomerIssues(result.warnings),
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
        issues: inadequate ? busbarIssues(result.warnings) : undefined,
      },
      draggable: false,
    });
    // Radial feed: every section gets its own dropper from the incomer, so no
    // section bar carries another section's through-current.
    edges.push({
      id: `e-incomer-busbar-${k}`,
      source: 'incomer',
      target: busId,
      targetHandle: k === 0 ? 'top' : 'lin',
      type: 'smoothstep',
      style: k > 0 ? { stroke: 'var(--mantine-color-indigo-4)', strokeWidth: 2 } : undefined,
    });

    section.circuitIds.forEach((cid, j) => {
      const c = byId.get(cid);
      if (!c) return;
      const x = j * (BRANCH_W + BRANCH_GAP);
      const data: BranchNodeData = {
        name: c.name,
        breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
        cable: `${c.cable.runsPerPhase && c.cable.runsPerPhase > 1 ? `${c.cable.runsPerPhase}× ` : ''}${c.cable.csaMm2} mm²`,
        starter: c.control?.starterType.replace('_', '-'),
        warn: !c.voltageDrop.withinLimit,
        breakerOverridden: c.breaker.overridden === true,
        cableOverridden: c.cable.overridden === true,
        issues: circuitIssues(result.warnings, cid),
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

  // Double-click to edit, consistent with the Build tab: a branch opens its
  // circuit editor (its cable edge focuses the cable), the incomer/busbar opens
  // panel settings.
  const [editing, setEditing] = useState<{ circuitId: string; focus: 'device' | 'cable' } | null>(
    null,
  );
  const [panelSettingsOpen, setPanelSettingsOpen] = useState(false);
  const editingCircuit = editing ? panel.circuits.find((c) => c.id === editing.circuitId) : undefined;
  const editingResult = editing
    ? result.circuits.find((c) => c.circuitId === editing.circuitId)
    : undefined;

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
      <Box
        h={440}
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-lg)',
          background: 'var(--mantine-color-body)',
          overflow: 'hidden',
        }}
      >
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
            // Reserve double-click for opening the editor (zoom would swallow it).
            zoomOnDoubleClick={false}
            onNodeDoubleClick={(_, node) => {
              if (node.type === 'branch') setEditing({ circuitId: node.id, focus: 'device' });
              else if (node.type === 'incomer' || node.type === 'busbar') setPanelSettingsOpen(true);
            }}
            onEdgeDoubleClick={(_, edge) => {
              const id = edge.id.startsWith('e-busbar-') ? edge.id.slice('e-busbar-'.length) : '';
              if (id) setEditing({ circuitId: id, focus: 'cable' });
            }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>

      {editing && editingCircuit && (
        <CircuitEditor
          panelId={panel.id}
          circuit={editingCircuit}
          result={editingResult}
          focus={editing.focus}
          opened
          onClose={() => setEditing(null)}
        />
      )}
      <PanelSettingsEditor panel={panel} opened={panelSettingsOpen} onClose={() => setPanelSettingsOpen(false)} />
    </Stack>
  );
}
