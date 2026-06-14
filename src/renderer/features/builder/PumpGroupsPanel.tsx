import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconDroplet, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import type {
  LevelSensing,
  PanelInput,
  PanelResult,
  PumpGroupConfig,
  PumpGroupMode,
  PumpGroupResult,
  PumpGroupTrigger,
} from '@shared/types';
import { PUMP_GROUP_MODES, PUMP_GROUP_MODE_KEYS, PUMP_GROUP_TRIGGERS } from '@shared/standards';
import { useProjectStore } from '@renderer/state/projectStore';
import { SchematicCanvas } from '@renderer/features/schematic/SchematicCanvas';

const MODE_OPTIONS = PUMP_GROUP_MODE_KEYS.map((m) => ({ value: m, label: PUMP_GROUP_MODES[m].label }));
const TRIGGER_OPTIONS = (Object.keys(PUMP_GROUP_TRIGGERS) as PumpGroupTrigger[]).map((tk) => ({
  value: tk,
  label: PUMP_GROUP_TRIGGERS[tk].label,
}));
const SENSING_OPTIONS: { value: LevelSensing; label: string }[] = [
  { value: 'float', label: 'Float switches' },
  { value: 'electrode', label: 'Electrodes' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'ultrasonic', label: 'Ultrasonic' },
];

/**
 * Pump-group editor: assign pump circuits into a functional group and pick the
 * control scheme (single/parallel alternation, lead-lag, parallel, cascade) and
 * the trigger (water-level controller, timer, pressure). The engine derives the
 * shared gear, the cross-pump interlocks and the group control schematic, all
 * shown live below each group.
 */
export function PumpGroupsPanel({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();
  const addPumpGroup = useProjectStore((s) => s.addPumpGroup);
  const updatePumpGroup = useProjectStore((s) => s.updatePumpGroup);
  const removePumpGroup = useProjectStore((s) => s.removePumpGroup);

  // Candidate members: pump (and motor) circuits on this panel.
  const pumpCircuits = panel.circuits.filter(
    (c) => c.loadKind === 'pump' || c.loadKind === 'motor',
  );
  const memberOptions = pumpCircuits.map((c) => ({ value: c.id, label: c.name }));

  const groups = panel.pumpGroups ?? [];
  const resultById = new Map((result.pumpGroups ?? []).map((g) => [g.id, g]));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('pumpGroups.eyebrow')}
          </Text>
          <Text size="sm" c="dimmed" maw={620}>
            {t('pumpGroups.intro')}
          </Text>
        </div>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          disabled={pumpCircuits.length === 0}
          onClick={() => addPumpGroup(panel.id)}
        >
          {t('pumpGroups.addGroup')}
        </Button>
      </Group>

      {pumpCircuits.length === 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          {t('pumpGroups.noPumps')}
        </Alert>
      )}

      {pumpCircuits.length > 0 && groups.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('pumpGroups.noGroups')}
        </Text>
      )}

      {groups.map((g) => (
        <PumpGroupCard
          key={g.id}
          panelId={panel.id}
          group={g}
          memberOptions={memberOptions}
          derived={resultById.get(g.id)}
          onChange={(patch) => updatePumpGroup(panel.id, g.id, patch)}
          onRemove={() => removePumpGroup(panel.id, g.id)}
        />
      ))}
    </Stack>
  );
}

function PumpGroupCard({
  panelId: _panelId,
  group,
  memberOptions,
  derived,
  onChange,
  onRemove,
}: {
  panelId: string;
  group: PumpGroupConfig;
  memberOptions: { value: string; label: string }[];
  derived: PumpGroupResult | undefined;
  onChange: (patch: Partial<PumpGroupConfig>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const modeDef = PUMP_GROUP_MODES[group.mode];

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" wrap="nowrap" mb="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon variant="light" color="cyan">
            <IconDroplet size={16} />
          </ThemeIcon>
          <TextInput
            variant="filled"
            size="sm"
            style={{ flex: 1, maxWidth: 320 }}
            value={group.name}
            aria-label={t('pumpGroups.name')}
            onChange={(e) => onChange({ name: e.currentTarget.value })}
          />
        </Group>
        <Tooltip label={t('pumpGroups.remove')} withArrow>
          <ActionIcon variant="subtle" color="red" aria-label={t('pumpGroups.remove')} onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Select
          label={t('pumpGroups.mode')}
          data={MODE_OPTIONS}
          value={group.mode}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(v) => v && onChange({ mode: v as PumpGroupMode })}
        />
        <Select
          label={t('pumpGroups.trigger')}
          data={TRIGGER_OPTIONS}
          value={group.trigger}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(v) => v && onChange({ trigger: v as PumpGroupTrigger })}
        />
      </SimpleGrid>

      <Text size="xs" c="dimmed" mt={6}>
        {modeDef.description}
      </Text>

      <MultiSelect
        mt="sm"
        label={t('pumpGroups.members')}
        placeholder={t('pumpGroups.membersPlaceholder')}
        data={memberOptions}
        value={group.memberCircuitIds}
        comboboxProps={{ withinPortal: true }}
        onChange={(v) => onChange({ memberCircuitIds: v })}
      />

      {group.trigger === 'level' && (
        <Select
          mt="sm"
          label={t('pumpGroups.sensing')}
          data={SENSING_OPTIONS}
          value={group.sensing ?? 'float'}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          w={220}
          onChange={(v) => v && onChange({ sensing: v as LevelSensing })}
        />
      )}
      {group.trigger === 'timer' && (
        <SimpleGrid cols={2} spacing="sm" mt="sm" maw={360}>
          <NumberInput
            label={t('pumpGroups.timerOn')}
            value={group.timerOnMin ?? 5}
            min={1}
            suffix=" min"
            onChange={(v) => onChange({ timerOnMin: typeof v === 'number' ? v : 5 })}
          />
          <NumberInput
            label={t('pumpGroups.timerOff')}
            value={group.timerOffMin ?? 10}
            min={1}
            suffix=" min"
            onChange={(v) => onChange({ timerOffMin: typeof v === 'number' ? v : 10 })}
          />
        </SimpleGrid>
      )}

      {derived && (
        <Stack gap="xs" mt="md">
          {derived.warnings.map((w, i) => (
            <Alert key={i} color="yellow" icon={<IconAlertTriangle size={16} />} py={6}>
              <Text size="xs">{w}</Text>
            </Alert>
          ))}

          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              {t('pumpGroups.components')}
            </Text>
            <Group gap={6} mt={4}>
              {derived.devices.length === 0 ? (
                <Text size="xs" c="dimmed">
                  —
                </Text>
              ) : (
                derived.devices.map((d) => (
                  <Badge key={d.id} variant="light" color="cyan" size="sm">
                    {d.role}
                    {d.rating && d.rating !== '-' ? ` · ${d.rating}` : ''}
                  </Badge>
                ))
              )}
            </Group>
          </div>

          {derived.interlocks.length > 0 && (
            <div>
              <Group gap={6}>
                <IconLock size={13} color="var(--mantine-color-red-6)" />
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  {t('pumpGroups.interlocks')}
                </Text>
              </Group>
              <Stack gap={2} mt={4}>
                {derived.interlocks.map((il) => (
                  <Group key={il.id} gap="xs" wrap="nowrap" align="flex-start">
                    <Badge size="xs" variant="light" color={il.relation === 'mutual_exclusion' ? 'red' : 'orange'}>
                      {il.relation.replace('_', ' ')}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {il.note}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </div>
          )}

          {derived.memberCircuitIds.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
                {t('pumpGroups.schematic')}
              </Text>
              <SchematicCanvas
                schematic={derived.schematic}
                onSelectRung={() => undefined}
                onSelectSymbol={() => undefined}
              />
            </div>
          )}
        </Stack>
      )}
    </Card>
  );
}
