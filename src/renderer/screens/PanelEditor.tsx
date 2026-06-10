import { useTranslation } from 'react-i18next';
import { Alert, Card, Grid, Group, Select, Stack, Tabs, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBulb,
  IconColumns,
  IconCpu,
  IconLayoutGrid,
  IconListDetails,
  IconSitemap,
  IconTable,
} from '@tabler/icons-react';
import { OCCUPANCY_PRESETS, OCCUPANCY_TYPES } from '@shared/standards';
import type { OccupancyType } from '@shared/types';
import { panelLabel } from '@shared/labels';
import { CircuitTable } from '@renderer/features/builder/CircuitTable';
import { ResultsPanel } from '@renderer/features/results/ResultsPanel';
import { IssuesPanel } from '@renderer/features/issues/IssuesPanel';
import { SchematicView } from '@renderer/features/schematic/SchematicView';
import { PanelLayout } from '@renderer/features/layout/PanelLayout';
import { SwitchingDiagram } from '@renderer/features/layout/SwitchingDiagram';
import { CableSchedule } from '@renderer/features/schedule/CableSchedule';
import { PanelSld } from '@renderer/screens/sld/PanelSld';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

/** The single-panel editor: structured builder on the left, views on the right. */
export function PanelEditor() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setPanelOccupancy = useProjectStore((s) => s.setPanelOccupancy);
  const updatePanel = useProjectStore((s) => s.updatePanel);

  // Compute the whole system so feeder loads aggregate correctly, then pick this panel.
  const system = useSystemResult();

  const panel = project.panels.find((p) => p.id === activePanelId);
  const result = panel ? system.panels[panel.id] : undefined;

  const panelOptions = project.panels.map((p) => ({ value: p.id, label: panelLabel(p) }));
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
          <Select
            label={t('panel.activePanel')}
            data={panelOptions}
            value={activePanelId}
            allowDeselect={false}
            onChange={(v) => v && setActivePanel(v)}
            w={240}
          />
        </Group>
      </Group>

      <Grid gutter="md" align="stretch">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{t('panel.circuitBuilder')}</Text>
              <Text size="xs" c="dimmed">
                {panel.system} · {panel.voltageV} V
              </Text>
            </Group>
            <CircuitTable panelId={panel.id} />
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card withBorder radius="md" padding="md" h="100%">
            <Tabs defaultValue="sld" keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="sld" leftSection={<IconSitemap size={16} />}>
                  {t('panel.tabSingleLine')}
                </Tabs.Tab>
                <Tabs.Tab value="schematic" leftSection={<IconCpu size={16} />}>
                  {t('panel.tabSchematic')}
                </Tabs.Tab>
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
                      <Text size="xs" c="orange" fw={700}>
                        {issueCount}
                      </Text>
                    ) : null
                  }
                >
                  {t('panel.tabIssues')}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="sld">
                <PanelSld panel={panel} result={result} />
              </Tabs.Panel>
              <Tabs.Panel value="schematic">
                <SchematicView panel={panel} result={result} />
              </Tabs.Panel>
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
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
