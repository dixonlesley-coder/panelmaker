import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconRefresh, IconShieldBolt } from '@tabler/icons-react';
import { computeSystem } from '@shared/engine';
import { EARTHING_SYSTEMS } from '@shared/standards';
import type { EarthingSystem, InstallMethod } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';
import { appVersion, checkForUpdates } from '@renderer/api';

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
  const setEarthingSystem = useProjectStore((s) => s.setEarthingSystem);

  const panel = project.panels.find((p) => p.id === activePanelId);

  const system = useMemo(() => computeSystem(project), [project]);
  const standardsVersion = Object.values(system.panels)[0]?.standardsVersion ?? 'unknown';
  const earthing = system.earthing;

  const [version, setVersion] = useState('…');
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  async function onCheckUpdates() {
    setChecking(true);
    const status = await checkForUpdates();
    setChecking(false);
    const message =
      status.state === 'available'
        ? `Update ${status.version} available — downloading.`
        : status.state === 'not-available'
          ? "You're on the latest version."
          : status.state === 'disabled'
            ? status.reason
            : status.state === 'error'
              ? `Update check failed: ${status.message}`
              : 'Checking…';
    notifications.show({ message, color: status.state === 'available' ? 'indigo' : 'gray' });
  }

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
        <Group gap="xs" mb="md">
          <IconShieldBolt size={18} color="var(--mantine-color-teal-6)" />
          <Text fw={600}>Earthing &amp; grounding</Text>
        </Group>
        <Select
          label="Earthing system"
          description="Project-wide; drives RCD requirements and bonding"
          data={EARTHING_SYSTEMS.map((e) => ({ value: e.value, label: e.label }))}
          value={project.earthingSystem ?? 'TN-C-S'}
          allowDeselect={false}
          onChange={(v) => v && setEarthingSystem(v as EarthingSystem)}
          mb="md"
          maw={360}
        />
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
          <KeyStat k="RCD policy" v={earthing.requiresRcd ? 'All final circuits' : 'Sockets / EV only'} />
          <KeyStat k="Main earthing" v={`${earthing.mainEarthingConductorMm2} mm²`} />
          <KeyStat k="Main bonding" v={`${earthing.mainBondingConductorMm2} mm²`} />
          <KeyStat k="Electrode target" v={`≤ ${earthing.electrodeResistanceTargetOhm} Ω`} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {earthing.note}
        </Text>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>Application</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            loading={checking}
            onClick={onCheckUpdates}
          >
            Check for updates
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Version
            </Text>
            <Text size="sm" fw={500} ff="monospace">
              {version}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Currency
            </Text>
            <Text size="sm" fw={500}>
              IDR
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Standards
            </Text>
            <Text size="sm" fw={500} ff="monospace">
              {standardsVersion}
            </Text>
          </Group>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="xs">
          PanelMaker auto-updates from GitHub releases in the installed desktop app; downloads apply
          on restart.
        </Text>
      </Card>

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
        Changes recompute the panel live. The active panel is set from the System view or the Panel
        editor's dropdown.
      </Alert>
    </Stack>
  );
}

/** Compact key/value for the earthing design strip. */
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
