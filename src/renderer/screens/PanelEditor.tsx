import { useMemo } from 'react';
import { Alert, Card, Grid, Group, Select, Stack, Tabs, Text, Title } from '@mantine/core';
import {
  IconAlertTriangle,
  IconColumns,
  IconCpu,
  IconLayoutGrid,
  IconListDetails,
  IconSitemap,
  IconTable,
} from '@tabler/icons-react';
import { computeSystem } from '@shared/engine';
import { CircuitTable } from '@renderer/features/builder/CircuitTable';
import { ResultsPanel } from '@renderer/features/results/ResultsPanel';
import { IssuesPanel } from '@renderer/features/issues/IssuesPanel';
import { SchematicView } from '@renderer/features/schematic/SchematicView';
import { PanelLayout } from '@renderer/features/layout/PanelLayout';
import { CableSchedule } from '@renderer/features/schedule/CableSchedule';
import { PanelSld } from '@renderer/screens/sld/PanelSld';
import { useProjectStore } from '@renderer/state/projectStore';

/** The single-panel editor: structured builder on the left, views on the right. */
export function PanelEditor() {
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);

  // Compute the whole system so feeder loads aggregate correctly, then pick this panel.
  const system = useMemo(() => computeSystem(project), [project]);

  const panel = project.panels.find((p) => p.id === activePanelId);
  const result = panel ? system.panels[panel.id] : undefined;

  const panelOptions = project.panels.map((p) => ({ value: p.id, label: p.name }));

  if (!panel || !result) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={18} />} title="No panel selected">
        Select a panel from the System view or the dropdown above.
      </Alert>
    );
  }

  const issueCount = result.warnings.length;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Panel editor
          </Text>
          <Title order={3}>{panel.name}</Title>
        </div>
        <Select
          label="Active panel"
          data={panelOptions}
          value={activePanelId}
          allowDeselect={false}
          onChange={(v) => v && setActivePanel(v)}
          w={280}
        />
      </Group>

      <Grid gutter="md" align="stretch">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder radius="md" padding="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Circuit builder</Text>
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
                  Single-line
                </Tabs.Tab>
                <Tabs.Tab value="schematic" leftSection={<IconCpu size={16} />}>
                  Control schematic
                </Tabs.Tab>
                <Tabs.Tab value="layout" leftSection={<IconLayoutGrid size={16} />}>
                  Layout
                </Tabs.Tab>
                <Tabs.Tab value="schedule" leftSection={<IconColumns size={16} />}>
                  Cable schedule
                </Tabs.Tab>
                <Tabs.Tab value="results" leftSection={<IconTable size={16} />}>
                  Results
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
                  Issues
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
