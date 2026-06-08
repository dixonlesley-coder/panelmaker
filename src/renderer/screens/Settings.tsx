import { useMemo } from 'react';
import {
  Alert,
  Card,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { computeSystem } from '@shared/engine';
import type { InstallMethod } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';

/** Install-method options for the panel default Select. */
const INSTALL_METHODS: { value: InstallMethod; label: string }[] = [
  { value: 'conduit', label: 'In conduit' },
  { value: 'trunking', label: 'In trunking' },
  { value: 'wall', label: 'Clipped to wall' },
  { value: 'air', label: 'Free air' },
  { value: 'tray', label: 'On cable tray' },
  { value: 'buried', label: 'Buried' },
];

export function Settings() {
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const updatePanel = useProjectStore((s) => s.updatePanel);

  const panel = project.panels.find((p) => p.id === activePanelId);

  // Read the standards version off any computed panel result.
  const standardsVersion = useMemo(() => {
    const system = computeSystem(project);
    return Object.values(system.panels)[0]?.standardsVersion ?? 'unknown';
  }, [project]);

  if (!panel) {
    return (
      <Alert color="yellow" title="No panel selected">
        Select a panel first to edit its defaults.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Settings
        </Text>
        <Title order={3}>Panel defaults — {panel.name}</Title>
      </div>

      <Card withBorder radius="md" padding="md">
        <Text fw={600} mb="md">
          Environment &amp; derating
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Ambient temperature"
            description="Used for cable derating"
            suffix=" °C"
            min={10}
            max={70}
            value={panel.ambientTempC}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { ambientTempC: v })
            }
          />
          <NumberInput
            label="Grouping count"
            description="Circuits bundled together"
            min={1}
            max={20}
            value={panel.groupingCount}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { groupingCount: v })
            }
          />
          <Select
            label="Install method"
            data={INSTALL_METHODS}
            value={panel.installMethod}
            allowDeselect={false}
            onChange={(v) => v && updatePanel(panel.id, { installMethod: v as InstallMethod })}
          />
          <NumberInput
            label="Diversity factor"
            description="Applied to aggregated downstream load"
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            value={panel.diversityFactor}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { diversityFactor: v })
            }
          />
        </SimpleGrid>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Text fw={600} mb="md">
          Project
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Currency
            </Text>
            <Text size="sm" fw={500}>
              IDR (Indonesian Rupiah)
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Standards version
            </Text>
            <Text size="sm" fw={500} ff="monospace">
              {standardsVersion}
            </Text>
          </Group>
        </SimpleGrid>
      </Card>

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
        Changes recompute the panel live. The active panel is set from the System view or the Panel
        editor's dropdown.
      </Alert>
    </Stack>
  );
}
