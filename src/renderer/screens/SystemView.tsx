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
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconCash,
  IconChevronDown,
  IconDeviceFloppy,
  IconDownload,
  IconFileSpreadsheet,
  IconFileTypeCsv,
  IconLayoutGridAdd,
  IconListDetails,
  IconPlus,
  IconSitemap,
  IconSolarPanel,
  IconStack2,
  IconTableExport,
  IconTableImport,
  IconTags,
} from '@tabler/icons-react';
import type { CostResult, ProjectInput, SystemResult } from '@shared/types';
import { Stat } from '@renderer/features/components/Stat';
import { NODE_TYPES, type PanelNodeData } from '@renderer/screens/sld/nodes';
import { PowerOneline } from '@renderer/screens/sld/PowerOneline';
import { costSystem, costSystemConsolidated } from '@renderer/lib/bom';
import { downloadBomCsv, downloadBomXlsx } from '@renderer/lib/bomExport';
import { downloadCsv } from '@renderer/lib/download';
import { cableScheduleCsv } from '@shared/io/scheduleExport';
import { parseLoadList } from '@shared/io/loadListImport';
import { panelLabel } from '@shared/labels';
import { formatAmps, formatIdr, formatKw } from '@renderer/lib/format';
import { PANEL_TEMPLATES } from '@renderer/data/panelTemplates';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';
import { exportLabelsPdf, exportSystemPdf, saveProjectToDisk } from '@renderer/api';

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
      const panel = byId.get(id);
      const result = system.panels[id];
      if (!panel || !result) return;
      const data: PanelNodeData = {
        name: result.name,
        ...(panel.tag ? { tag: panel.tag } : {}),
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
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setScreen = useProjectStore((s) => s.setScreen);
  const addPanel = useProjectStore((s) => s.addPanel);
  const addPanelFromTemplate = useProjectStore((s) => s.addPanelFromTemplate);
  const importPanels = useProjectStore((s) => s.importPanels);

  const system = useSystemResult();
  const { nodes, edges } = useMemo(() => buildGraph(project, system), [project, system]);

  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystem(system, parts, priceMap);
  }, [system, parts, prices]);

  // Consolidated project-wide BOM (per-panel lines merged by part/description).
  const projectBom = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystemConsolidated(system, parts, priceMap);
  }, [system, parts, prices]);

  const openPanel = (panelId: string) => {
    setActivePanel(panelId);
    setScreen('panel');
  };

  /** Pick a CSV load list, parse it leniently, and append its panels (undoable). */
  function onImportLoadList() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void file.text().then((text) => {
        const { panels, warnings } = parseLoadList(text);
        if (panels.length === 0) {
          notifications.show({ message: t('system.loadListEmpty'), color: 'red' });
          return;
        }
        importPanels(panels);
        const circuitCount = panels.reduce((n, p) => n + p.circuits.length, 0);
        notifications.show({
          message: t('system.loadListImported', { panels: panels.length, circuits: circuitCount }),
          color: 'teal',
        });
        for (const w of warnings.slice(0, 5)) {
          notifications.show({ message: w, color: 'yellow' });
        }
        if (warnings.length > 5) {
          notifications.show({
            message: t('system.loadListMoreWarnings', { count: warnings.length - 5 }),
            color: 'yellow',
          });
        }
      });
    });
    document.body.appendChild(input);
    input.click();
  }

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
            {t('system.eyebrow')}
          </Text>
          <Title order={3}>{project.name}</Title>
        </div>
        <Group gap="xs">
          <Menu position="bottom-end" withinPortal shadow="md" width={300}>
            <Menu.Target>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                rightSection={<IconChevronDown size={14} />}
              >
                {t('system.addPanel')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconLayoutGridAdd size={14} />}
                onClick={() => addPanel()}
              >
                {t('system.blankPanel')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Label>{t('system.fromTemplate')}</Menu.Label>
              {PANEL_TEMPLATES.map((tpl) => (
                <Menu.Item
                  key={tpl.id}
                  leftSection={<IconSitemap size={14} />}
                  onClick={() => addPanelFromTemplate(tpl.id)}
                >
                  <Text size="sm">{tpl.label}</Text>
                  <Text size="xs" c="dimmed">
                    {tpl.description}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={async () => notify(await saveProjectToDisk(project))}
          >
            {t('system.save')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={async () => notify(await exportSystemPdf(project))}
          >
            {t('system.exportSystemPdf')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconTags size={14} />}
            onClick={async () => notify(await exportLabelsPdf(project))}
          >
            {t('system.exportLabels')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconTableExport size={14} />}
            onClick={() => {
              downloadCsv(`${project.name} - cable schedule.csv`, cableScheduleCsv(system));
              notifications.show({ message: t('system.cableScheduleExported'), color: 'teal' });
            }}
          >
            {t('system.exportCableSchedule')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconTableImport size={14} />}
            onClick={onImportLoadList}
          >
            {t('system.importLoadList')}
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Stat
          label={t('system.connectedLoad')}
          value={formatKw(system.totals.connectedLoadW)}
          icon={<IconBolt size={18} />}
        />
        <Stat
          label={t('system.panels')}
          value={system.totals.panelCount}
          hint={t('system.inThisBuilding')}
          icon={<IconStack2 size={18} />}
          color="grape"
        />
        <Stat
          label={t('system.estimatedCost')}
          value={formatIdr(cost.grandTotal)}
          hint={
            cost.unmatchedCount > 0
              ? t('system.unpricedLines', { count: cost.unmatchedCount })
              : t('system.allPriced')
          }
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
              {t('system.supply')}
            </Text>
            <Badge variant="light" color={sup.type === 'MV' ? 'orange' : 'teal'}>
              {sup.type === 'MV' ? t('system.supplyMv') : t('system.supplyLv')}
            </Badge>
          </Group>
          <Text size="sm" fw={600}>
            {t('system.demandKva', { kva: sup.demandKva })}
          </Text>
        </Group>
        {sup.type === 'MV' && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
            <KeyStat k={t('system.transformer')} v={`${sup.transformerKva} kVA`} />
            <KeyStat k={t('system.mvVoltage')} v={`${(sup.mvVoltageV ?? 0) / 1000} kV`} />
            <KeyStat k={t('system.impedance')} v={`${sup.transformerImpedancePct}%`} />
            <KeyStat
              k={t('system.primarySecondary')}
              v={`${formatAmps(sup.transformerPrimaryA ?? 0)} / ${formatAmps(sup.transformerSecondaryA ?? 0)}`}
            />
          </SimpleGrid>
        )}
        <Text size="xs" c="dimmed">
          {sup.note}
        </Text>
        {system.metering && (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mt="sm" mb="xs">
              <KeyStat
                k={t('system.plnService')}
                v={
                  system.metering.mvService
                    ? t('system.plnServiceMv')
                    : `${(system.metering.serviceVa / 1000).toLocaleString('en-US')} kVA`
                }
              />
              <KeyStat k={t('system.serviceCurrent')} v={formatAmps(system.metering.serviceCurrentA)} />
              <KeyStat
                k={t('system.metering')}
                v={
                  system.metering.metering === 'direct'
                    ? t('system.meteringDirect')
                    : t('system.meteringCt')
                }
              />
              {system.metering.ctRatio && (
                <KeyStat
                  k={t('system.ct')}
                  v={`${system.metering.ctRatio} · ${system.metering.ctClass}`}
                />
              )}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              {system.metering.note}
            </Text>
          </>
        )}
      </Card>

      <FaultLevelsCard system={system} />

      <SelectivityCard system={system} />

      {system.sources && (
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="green">
              <IconSolarPanel size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('system.energySources')}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {system.sources.generator && (
              <KeyStat k={t('system.generator')} v={`${system.sources.generator.ratingKva} kVA`} />
            )}
            {system.sources.solar && (
              <KeyStat
                k={t('system.solarPv')}
                v={`${system.sources.solar.arrayKwp} kWp · ${system.sources.solar.inverterKw} kW`}
              />
            )}
            {system.sources.battery && (
              <KeyStat k={t('system.battery')} v={`${system.sources.battery.installedKwh} kWh`} />
            )}
          </SimpleGrid>
        </Card>
      )}

      <Card withBorder radius="md" padding="xs">
        <Tabs defaultValue="building">
          <Tabs.List>
            <Tabs.Tab value="building" leftSection={<IconSitemap size={14} />}>
              {t('system.tabBuilding')}
            </Tabs.Tab>
            <Tabs.Tab value="power" leftSection={<IconBolt size={14} />}>
              {t('system.tabPower')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="building" pt="xs">
            <Group justify="flex-end" px="xs" pb={4}>
              <Text size="xs" c="dimmed">
                {t('system.clickPanelHint')}
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
              // Reserve double-click for opening the panel; otherwise React
              // Flow's built-in zoom-on-double-click swallows it (and a click a
              // few px off the node hits the pane-zoom instead of the node).
              zoomOnDoubleClick={false}
              onNodeDoubleClick={(_, node) => openPanel(node.id)}
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

      <ProjectBomCard cost={projectBom} projectName={project.name} />
    </Stack>
  );
}

/**
 * The consolidated project-wide bill of materials: every panel's lines merged by
 * part/description and category, with a grand total and CSV/Excel export. Reuses
 * the per-panel BOM export helpers — the only difference is the consolidated
 * line set.
 */
function ProjectBomCard({ cost, projectName }: { cost: CostResult; projectName: string }) {
  const { t } = useTranslation();
  const { lines } = cost;
  if (lines.length === 0) return null;

  const safeName = projectName.replace(/[^\w.-]+/g, '_');

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <ThemeIcon variant="light" color="indigo">
            <IconListDetails size={16} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {t('system.projectBom')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('system.bomConsolidated', { count: lines.length })}
          </Text>
        </Group>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFileTypeCsv size={14} />}
            onClick={() => downloadBomCsv(`${safeName} - project BOM.csv`, lines, cost.currency)}
          >
            {t('system.exportProjectBomCsv')}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFileSpreadsheet size={14} />}
            onClick={() => downloadBomXlsx(`${safeName} - project BOM.xlsx`, lines, cost.currency)}
          >
            {t('system.exportProjectBomXlsx')}
          </Button>
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={620}>
        <Table verticalSpacing="xs" fz="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('system.bomItem')}</Table.Th>
              <Table.Th w={120}>{t('system.bomCategory')}</Table.Th>
              <Table.Th w={120}>{t('system.bomOrderCode')}</Table.Th>
              <Table.Th w={60} ta="right">
                {t('system.bomQty')}
              </Table.Th>
              <Table.Th w={150} ta="right">
                {t('system.bomLineTotal')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l, i) => (
              <Table.Tr key={`${l.partId ?? l.description}-${i}`}>
                <Table.Td>{l.description}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color="gray" size="sm" tt="none">
                    {l.category}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {l.sku ? (
                    <Text size="xs" ff="monospace">
                      {l.sku}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{l.qty}</Table.Td>
                <Table.Td ta="right">
                  {l.matched && l.lineTotal !== undefined ? (
                    formatIdr(l.lineTotal)
                  ) : (
                    <Badge size="xs" variant="light" color="gray">
                      {t('system.noPrice')}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Group justify="space-between" mt="sm">
        <Text size="xs" c="dimmed">
          {cost.unmatchedCount > 0
            ? t('system.unpricedExcluded', { count: cost.unmatchedCount })
            : t('system.allLinesPriced')}
        </Text>
        <Text fw={700}>{formatIdr(cost.grandTotal)}</Text>
      </Group>
    </Card>
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

/**
 * Current-based discrimination report per cascaded feeder→sub-panel pair: the
 * upstream/downstream ratings, their ratio, and whether the rule-of-thumb screen
 * is met. Full coordination still needs manufacturer time-current curves.
 */
function SelectivityCard({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const rows = system.selectivity;
  if (!rows || rows.length === 0) return null;

  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="xs" mb="xs">
        <ThemeIcon variant="light" color="indigo">
          <IconSitemap size={16} />
        </ThemeIcon>
        <Text fw={600} size="sm">
          {t('system.selectivity')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('system.selectivityHint')}
        </Text>
      </Group>
      <Table.ScrollContainer minWidth={520}>
        <Table verticalSpacing="xs" fz="sm" withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('system.selColFeeder')}</Table.Th>
              <Table.Th w={90}>{t('system.selColUpstream')}</Table.Th>
              <Table.Th>{t('system.selColSubPanel')}</Table.Th>
              <Table.Th w={100}>{t('system.selColDownstream')}</Table.Th>
              <Table.Th w={70}>{t('system.selColRatio')}</Table.Th>
              <Table.Th w={110}>{t('system.selColDiscrimination')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((e) => (
              <Table.Tr key={`${e.upstreamCircuitId}-${e.downstreamPanelId}`}>
                <Table.Td>{e.upstreamName}</Table.Td>
                <Table.Td>{formatAmps(e.upstreamRatingA)}</Table.Td>
                <Table.Td>{e.downstreamName}</Table.Td>
                <Table.Td>{formatAmps(e.downstreamRatingA)}</Table.Td>
                <Table.Td>{e.ratio.toFixed(2)}×</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={e.selective ? 'teal' : 'red'} size="sm">
                    {e.selective ? t('system.selOk') : t('system.selRisk')}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

/**
 * Prospective short-circuit (Isc) at each panel's bus, root-first. The fault
 * decays down feeder runs; a panel is flagged when one of its devices cannot
 * break the fault present at it.
 */
function FaultLevelsCard({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const rows = system.order
    .map((id) => system.panels[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.faultLevelKa !== undefined);
  if (rows.length === 0) return null;

  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="xs" mb="xs">
        <ThemeIcon variant="light" color="red">
          <IconBolt size={16} />
        </ThemeIcon>
        <Text fw={600} size="sm">
          {t('system.faultLevels')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('system.faultLevelsHint')}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
        {rows.map((p) => {
          const inadequate = p.warnings.some((w) => w.code === 'breaking-capacity-inadequate');
          return (
            <Group key={p.panelId} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate>
                {panelLabel(p)}
              </Text>
              <Badge variant={inadequate ? 'filled' : 'light'} color={inadequate ? 'red' : 'gray'}>
                {p.faultLevelKa} kA
              </Badge>
            </Group>
          );
        })}
      </SimpleGrid>
    </Card>
  );
}
