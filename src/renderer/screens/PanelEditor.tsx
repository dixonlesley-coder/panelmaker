import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Badge, Card, Group, Select, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconBulb,
  IconColumns,
  IconCpu,
  IconDroplet,
  IconLayoutGrid,
  IconListDetails,
  IconListNumbers,
  IconSitemap,
  IconTable,
} from '@tabler/icons-react';
import { OCCUPANCY_PRESETS, OCCUPANCY_TYPES } from '@shared/standards';
import type { OccupancyType } from '@shared/types';
import { CircuitTable } from '@renderer/features/builder/CircuitTable';
import { ResultsPanel } from '@renderer/features/results/ResultsPanel';
import { IssuesPanel } from '@renderer/features/issues/IssuesPanel';
import { SchematicView } from '@renderer/features/schematic/SchematicView';
import { PumpGroupsPanel } from '@renderer/features/builder/PumpGroupsPanel';
import { PanelLayout } from '@renderer/features/layout/PanelLayout';
import { SwitchingDiagram } from '@renderer/features/layout/SwitchingDiagram';
import { CableSchedule } from '@renderer/features/schedule/CableSchedule';
import { PanelSld } from '@renderer/screens/sld/PanelSld';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

/**
 * The single-panel inspector (opened as a drawer from the building single-line):
 * a tabbed workspace led by the structured circuit table — the fastest way to
 * type in a load schedule — with diagrams, schedules and results as further
 * tabs. Visual editing happens on the unified single-line canvas itself.
 */
export function PanelEditor() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setPanelOccupancy = useProjectStore((s) => s.setPanelOccupancy);
  const updatePanel = useProjectStore((s) => s.updatePanel);
  const movePanel = useProjectStore((s) => s.movePanel);

  // Compute the whole system so feeder loads aggregate correctly, then pick this panel.
  const system = useSystemResult();

  const panel = project.panels.find((p) => p.id === activePanelId);
  const result = panel ? system.panels[panel.id] : undefined;

  const panelIndex = project.panels.findIndex((p) => p.id === activePanelId);
  const occupancyOptions = OCCUPANCY_TYPES.map((o) => ({
    value: o,
    label: OCCUPANCY_PRESETS[o].label,
  }));

  if (!panel || !result) {
    return (
      <Alert
        color="yellow"
        icon={<IconAlertTriangle size={18} />}
        title={t('panel.noPanelTitle')}
      >
        {t('panel.noPanelBody')}
      </Alert>
    );
  }

  const issueCount = result.warnings.length;
  const errorCount = result.warnings.filter((w) => w.severity === 'error').length;
  const hasPumps = panel.circuits.some((c) => c.loadKind === 'pump' || c.loadKind === 'motor');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('panel.eyebrow')}
          </Text>
          {/* Tag (short designation, e.g. LP-1) + descriptive name — both label the
              panel everywhere (SLD, schedules, PDF, drawings). Edit inline. */}
          <Group gap="xs" align="center" wrap="nowrap">
            <TextInput
              variant="filled"
              size="xs"
              w={92}
              value={panel.tag ?? ''}
              aria-label={t('panel.tagLabel')}
              placeholder={t('panel.tagPlaceholder')}
              onChange={(e) => updatePanel(panel.id, { tag: e.currentTarget.value || undefined })}
              styles={{ input: { fontWeight: 700, fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
            <TextInput
              variant="unstyled"
              size="md"
              value={panel.name}
              aria-label={t('panel.nameLabel')}
              placeholder={t('panel.namePlaceholder')}
              onChange={(e) => updatePanel(panel.id, { name: e.currentTarget.value })}
              styles={{
                input: {
                  fontWeight: 700,
                  fontSize: 'var(--mantine-font-size-xl)',
                  lineHeight: 1.2,
                  height: 'auto',
                  minHeight: 'unset',
                },
              }}
            />
          </Group>
        </div>
        <Group gap="sm" align="flex-end">
          <Select
            label={t('panel.occupancy')}
            placeholder={t('panel.occupancyPlaceholder')}
            description={t('panel.occupancyHint')}
            data={occupancyOptions}
            value={panel.occupancy ?? null}
            clearable
            onChange={(v) => setPanelOccupancy(panel.id, (v as OccupancyType | null) ?? undefined)}
            w={210}
          />
          {/* Reorder THIS panel within the project (panels are switched on the
              canvas, not here): drives the building single-line layout within
              each feeder depth and the report order. */}
          <Group gap={4} align="flex-end">
            <Tooltip label={t('panel.moveUp')} withArrow>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('panel.moveUp')}
                disabled={panelIndex <= 0}
                onClick={() => movePanel(panel.id, 'up')}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('panel.moveDown')} withArrow>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('panel.moveDown')}
                disabled={panelIndex < 0 || panelIndex >= project.panels.length - 1}
                onClick={() => movePanel(panel.id, 'down')}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Group>

      <Card withBorder radius="md" padding="md">
        {/* The old drag-and-drop "Build" tab (VisualBuilder) was retired: the
            unified building single-line IS the visual builder now, and keeping
            a second canvas here split features (spares, auto-balance) from the
            primary surface. The structured table leads for typing-speed entry. */}
        <Tabs defaultValue="circuits" keepMounted={false} variant="pills" radius="xl">
          <Tabs.List mb="md" style={{ gap: 4 }}>
            <Tabs.Tab value="circuits" leftSection={<IconListNumbers size={16} />}>
              {t('panel.tabCircuits')}
            </Tabs.Tab>
            <Tabs.Tab value="sld" leftSection={<IconSitemap size={16} />}>
              {t('panel.tabSingleLine')}
            </Tabs.Tab>
            <Tabs.Tab value="schematic" leftSection={<IconCpu size={16} />}>
              {t('panel.tabSchematic')}
            </Tabs.Tab>
            {hasPumps && (
              <Tabs.Tab value="pumpgroups" leftSection={<IconDroplet size={16} />}>
                {t('panel.tabPumpGroups')}
              </Tabs.Tab>
            )}
            <Tabs.Tab value="layout" leftSection={<IconLayoutGrid size={16} />}>
              {t('panel.tabLayout')}
            </Tabs.Tab>
            <Tabs.Tab value="switching" leftSection={<IconBulb size={16} />}>
              {t('panel.tabSwitching')}
            </Tabs.Tab>
            <Tabs.Tab value="schedule" leftSection={<IconColumns size={16} />}>
              {t('panel.tabSchedule')}
            </Tabs.Tab>
            <Tabs.Tab value="results" leftSection={<IconTable size={16} />}>
              {t('panel.tabResults')}
            </Tabs.Tab>
            <Tabs.Tab
              value="issues"
              leftSection={<IconListDetails size={16} />}
              rightSection={
                issueCount > 0 ? (
                  // Same count badge as the canvas-toolbar Issues chip: filled
                  // (red) when any error blocks, light (orange) for advisories.
                  <Badge
                    size="xs"
                    circle
                    variant={errorCount > 0 ? 'filled' : 'light'}
                    color={errorCount > 0 ? 'red' : 'orange'}
                  >
                    {issueCount}
                  </Badge>
                ) : null
              }
            >
              {t('panel.tabIssues')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="circuits">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{t('panel.circuitBuilder')}</Text>
              <Text size="xs" c="dimmed">
                {panel.system} · {panel.voltageV} V
              </Text>
            </Group>
            <CircuitTable panelId={panel.id} />
          </Tabs.Panel>
          <Tabs.Panel value="sld">
            <PanelSld panel={panel} result={result} />
          </Tabs.Panel>
          <Tabs.Panel value="schematic">
            <SchematicView panel={panel} result={result} />
          </Tabs.Panel>
          {hasPumps && (
            <Tabs.Panel value="pumpgroups">
              <PumpGroupsPanel panel={panel} result={result} />
            </Tabs.Panel>
          )}
          <Tabs.Panel value="layout">
            <PanelLayout panel={panel} result={result} />
          </Tabs.Panel>
          <Tabs.Panel value="switching">
            <SwitchingDiagram panel={panel} result={result} />
          </Tabs.Panel>
          <Tabs.Panel value="schedule">
            <CableSchedule panel={panel} result={result} />
          </Tabs.Panel>
          <Tabs.Panel value="results">
            <ResultsPanel result={result} />
          </Tabs.Panel>
          <Tabs.Panel value="issues">
            <IssuesPanel result={result} />
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  );
}
