import { useMemo } from 'react';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconCash,
  IconDeviceFloppy,
  IconDownload,
  IconSitemap,
  IconSolarPanel,
  IconStack2,
} from '@tabler/icons-react';
import { computeSystem } from '@shared/engine';
import type { PanelInput, ProjectInput, SystemResult } from '@shared/types';
import { Stat } from '@renderer/features/components/Stat';
import { NODE_TYPES, type PanelNodeData } from '@renderer/screens/sld/nodes';
import { PowerOneline } from '@renderer/screens/sld/PowerOneline';
import { costSystem } from '@renderer/lib/bom';
import { formatAmps, formatIdr, formatKw } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';
import { exportSystemPdf, saveProjectToDisk } from '@renderer/api';

const NODE_W = 200;
const NODE_H = 130;
const COL_GAP = 60;
const ROW_GAP = 80;

/**
 * Layered top-down layout for the building single-line diagram. Depth (row) is
 * derived from the feeder tree; panels at the same depth are spread across the
 * row. The engine's `order` is root-first which makes the BFS deterministic.
 */
function buildGraph(
  project: ProjectInput,
  system: SystemResult,
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  // parent panel id -> via which circuit, and child panel id -> parent panel id
  const parentOf = new Map<string, string>();
  for (const p of project.panels) {
    for (const c of p.circuits) {
      if (c.feedsPanelId) parentOf.set(c.feedsPanelId, p.id);
    }
  }

  // Depth = distance from a root (a panel with no parent).
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const parent = parentOf.get(id);
    const d = parent ? depthOf(parent) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const p of project.panels) depthOf(p.id);

  // Group panels by depth in the engine's root-first order for stable columns.
  const rows = new Map<number, string[]>();
  for (const id of system.order) {
    const d = depth.get(id) ?? 0;
    const list = rows.get(d) ?? [];
    list.push(id);
    rows.set(d, list);
  }

  const nodes: Node[] = [];
  for (const [d, ids] of rows) {
    const rowWidth = ids.length * (NODE_W + COL_GAP) - COL_GAP;
    ids.forEach((id, i) => {
      const panel = byId.get(id) as PanelInput;
      const result = system.panels[id];
      if (!result) return;
      const data: PanelNodeData = {
        name: result.name,
        loadKw: formatKw(result.totalConnectedLoadW),
        incomerA: formatAmps(result.totalDemandCurrentA),
        source: panel.sourceType,
        warn: result.warnings.some((w) => w.severity === 'error' || w.severity === 'warning'),
      };
      nodes.push({
        id,
        type: 'panel',
        position: {
          x: i * (NODE_W + COL_GAP) - rowWidth / 2,
          y: d * (NODE_H + ROW_GAP),
        },
        data,
      });
    });
  }

  const edges: Edge[] = [];
  for (const [childId, parentId] of parentOf) {
    if (!system.panels[childId] || !system.panels[parentId]) continue;
    edges.push({
      id: `e-${parentId}-${childId}`,
      source: parentId,
      target: childId,
      type: 'smoothstep',
      animated: true,
      label: 'feeder',
    });
  }

  return { nodes, edges };
}

export function SystemView() {
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setScreen = useProjectStore((s) => s.setScreen);

  const system = useMemo(() => computeSystem(project), [project]);
  const { nodes, edges } = useMemo(() => buildGraph(project, system), [project, system]);

  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystem(system, parts, priceMap);
  }, [system, parts, prices]);

  const openPanel = (panelId: string) => {
    setActivePanel(panelId);
    setScreen('panel');
  };

  const notify = (res: { ok: boolean; reason?: string; message: string }) =>
    notifications.show({
      message: res.message,
      color: res.ok ? 'teal' : res.reason === 'web' ? 'blue' : 'red',
    });

  const sup = system.supply;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Building overview
          </Text>
          <Title order={3}>{project.name}</Title>
        </div>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={async () => notify(await saveProjectToDisk(project))}
          >
            Save
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={async () => notify(await exportSystemPdf(project))}
          >
            Export system PDF
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Stat
          label="Connected load"
          value={formatKw(system.totals.connectedLoadW)}
          icon={<IconBolt size={18} />}
        />
        <Stat
          label="Panels"
          value={system.totals.panelCount}
          hint="in this building"
          icon={<IconStack2 size={18} />}
          color="grape"
        />
        <Stat
          label="Estimated cost"
          value={formatIdr(cost.grandTotal)}
          hint={cost.unmatchedCount > 0 ? `${cost.unmatchedCount} unpriced lines` : 'all priced'}
          icon={<IconCash size={18} />}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb={sup.type === 'MV' ? 'xs' : 4}>
          <Group gap="xs">
            <ThemeIcon variant="light" color={sup.type === 'MV' ? 'orange' : 'teal'}>
              <IconBolt size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              Supply
            </Text>
            <Badge variant="light" color={sup.type === 'MV' ? 'orange' : 'teal'}>
              {sup.type === 'MV' ? 'Medium voltage + transformer' : 'Low voltage (direct PLN)'}
            </Badge>
          </Group>
          <Text size="sm" fw={600}>
            {sup.demandKva} kVA demand
          </Text>
        </Group>
        {sup.type === 'MV' && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
            <KeyStat k="Transformer" v={`${sup.transformerKva} kVA`} />
            <KeyStat k="MV voltage" v={`${(sup.mvVoltageV ?? 0) / 1000} kV`} />
            <KeyStat k="Impedance" v={`${sup.transformerImpedancePct}%`} />
            <KeyStat
              k="Primary / sec."
              v={`${formatAmps(sup.transformerPrimaryA ?? 0)} / ${formatAmps(sup.transformerSecondaryA ?? 0)}`}
            />
          </SimpleGrid>
        )}
        <Text size="xs" c="dimmed">
          {sup.note}
        </Text>
      </Card>

      {system.sources && (
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="green">
              <IconSolarPanel size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              Energy sources
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {system.sources.generator && (
              <KeyStat k="Generator" v={`${system.sources.generator.ratingKva} kVA`} />
            )}
            {system.sources.solar && (
              <KeyStat
                k="Solar PV"
                v={`${system.sources.solar.arrayKwp} kWp · ${system.sources.solar.inverterKw} kW`}
              />
            )}
            {system.sources.battery && (
              <KeyStat k="Battery" v={`${system.sources.battery.installedKwh} kWh`} />
            )}
          </SimpleGrid>
        </Card>
      )}

      <Card withBorder radius="md" padding="xs">
        <Tabs defaultValue="building">
          <Tabs.List>
            <Tabs.Tab value="building" leftSection={<IconSitemap size={14} />}>
              Building
            </Tabs.Tab>
            <Tabs.Tab value="power" leftSection={<IconBolt size={14} />}>
              Power one-line
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="building" pt="xs">
            <Group justify="flex-end" px="xs" pb={4}>
              <Text size="xs" c="dimmed">
                Click a panel to open it in the editor
              </Text>
            </Group>
            <Box h={460}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              nodesConnectable={false}
              nodesDraggable={false}
              onNodeClick={(_, node) => openPanel(node.id)}
            >
              <Background gap={18} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
            </Box>
          </Tabs.Panel>

          <Tabs.Panel value="power">
            <PowerOneline system={system} />
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
}

/** A compact key/value used in the supply/transformer card. */
function KeyStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={600}>
        {v}
      </Text>
    </div>
  );
}
