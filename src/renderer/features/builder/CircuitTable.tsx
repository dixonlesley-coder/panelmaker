import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import {
  IconAdjustmentsAlt,
  IconBulb,
  IconClipboard,
  IconCopy,
  IconCopyPlus,
  IconPlug,
  IconPlus,
  IconWand,
  IconTrash,
} from '@tabler/icons-react';
import type { CircuitInput, LoadKind, StarterType } from '@shared/types';
import { LOAD_KINDS, LOAD_DEFAULTS, SCHEDULE_PRESETS, presetKeyFor, STANDARD_BREAKER_RATINGS_A } from '@shared/standards';
import { STANDARD_SECTIONS_MM2 } from '@shared/standards/conductors';
import { derivedPointsLoadW } from '@shared/engine/fixtures';
import { selectHasClipboard, useProjectStore } from '@renderer/state/projectStore';
import { CircuitWizard } from '@renderer/features/builder/CircuitWizard';
import { PointsEditor } from '@renderer/features/builder/PointsEditor';

/** Load-kind options for the editable Select (full catalog). */
const LOAD_KIND_OPTIONS = LOAD_KINDS.map((k) => ({ value: k, label: LOAD_DEFAULTS[k].label }));

/** Manual-override pick lists: Auto + the standard ladders. */
const BREAKER_OVERRIDE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...STANDARD_BREAKER_RATINGS_A.map((r) => ({ value: String(r), label: `${r} A` })),
];
const CABLE_OVERRIDE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...STANDARD_SECTIONS_MM2.map((s) => ({ value: String(s), label: `${s} mm²` })),
];

/** Daily-usage schedule presets. */
const SCHEDULE_OPTIONS = SCHEDULE_PRESETS.map((p) => ({ value: p.key, label: p.label }));

/** Starter-type options, shown only for motor/pump circuits. */
const STARTER_OPTIONS: { value: StarterType; label: string }[] = [
  { value: 'DOL', label: 'DOL (direct on-line)' },
  { value: 'STAR_DELTA', label: 'Star-delta (Y-Δ)' },
  { value: 'REVERSING', label: 'Reversing' },
  { value: 'SOFT_STARTER', label: 'Soft starter' },
  { value: 'VFD', label: 'VFD' },
  { value: 'PUMP', label: 'Pump controller' },
];

/** True for circuits whose sizing is driven by motor kW rather than connected W. */
function isMotorKind(kind: LoadKind): boolean {
  return kind === 'motor' || kind === 'pump';
}

interface RowProps {
  panelId: string;
  circuit: CircuitInput;
  selected: boolean;
  /** Detailed mode shows the power-factor and usage-schedule columns. */
  detailed: boolean;
  onToggle: (checked: boolean) => void;
}

/** A single editable circuit row. Edits dispatch immutable store updates. */
function CircuitRow({ panelId, circuit, selected, detailed, onToggle }: RowProps) {
  const { t } = useTranslation();
  const updateCircuit = useProjectStore((s) => s.updateCircuit);
  const removeCircuit = useProjectStore((s) => s.removeCircuit);
  const duplicateCircuit = useProjectStore((s) => s.duplicateCircuit);
  const copyCircuit = useProjectStore((s) => s.copyCircuit);

  const motor = isMotorKind(circuit.loadKind);
  // Final circuits (lighting/socket) can model their points; the connected load
  // is then derived from the points and the flat kW input becomes read-only.
  const pointsCapable = circuit.loadKind === 'lighting' || circuit.loadKind === 'socket';
  const hasOverride = circuit.breakerOverrideA !== undefined || circuit.cableOverrideMm2 !== undefined;
  const derivedW = derivedPointsLoadW(circuit);
  const pointCount =
    (circuit.fixtures ?? []).reduce((n, f) => n + f.qty, 0) +
    (circuit.sockets ?? []).reduce((n, s) => n + s.qty, 0);
  const [pointsOpen, points] = useDisclosure(false);

  const patch = (p: Partial<CircuitInput>) => updateCircuit(panelId, circuit.id, p);

  return (
    <Table.Tr bg={selected ? 'var(--mantine-color-blue-light)' : undefined}>
      <Table.Td>
        <Checkbox
          checked={selected}
          size="xs"
          aria-label={t('builder.selectCircuit', { name: circuit.name })}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
      </Table.Td>

      <Table.Td>
        <TextInput
          value={circuit.name}
          size="xs"
          variant="filled"
          onChange={(e) => patch({ name: e.currentTarget.value })}
        />
      </Table.Td>

      <Table.Td>
        <Select
          data={LOAD_KIND_OPTIONS}
          value={circuit.loadKind}
          size="xs"
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            if (!value) return;
            const kind = value as LoadKind;
            // Keep dependent flags coherent when switching kinds.
            patch({
              loadKind: kind,
              isLighting: kind === 'lighting',
              ...(isMotorKind(kind)
                ? { motorKw: circuit.motorKw ?? 5.5, starterType: circuit.starterType ?? 'DOL' }
                : {}),
            });
          }}
        />
      </Table.Td>

      <Table.Td>
        {motor ? (
          <NumberInput
            value={circuit.motorKw ?? 0}
            size="xs"
            min={0}
            step={0.5}
            decimalScale={1}
            suffix=" kW"
            onChange={(v) => patch({ motorKw: typeof v === 'number' ? v : 0 })}
          />
        ) : derivedW !== undefined ? (
          <Tooltip label={t('builder.derivedFromPoints')}>
            <NumberInput
              value={derivedW / 1000}
              size="xs"
              decimalScale={2}
              suffix=" kW"
              disabled
            />
          </Tooltip>
        ) : (
          <NumberInput
            value={circuit.loadW / 1000}
            size="xs"
            min={0}
            step={0.5}
            decimalScale={2}
            suffix=" kW"
            onChange={(v) => patch({ loadW: (typeof v === 'number' ? v : 0) * 1000 })}
          />
        )}
      </Table.Td>

      <Table.Td>
        <NumberInput
          value={circuit.lengthM}
          size="xs"
          min={0}
          step={5}
          suffix=" m"
          onChange={(v) => patch({ lengthM: typeof v === 'number' ? v : 0 })}
        />
      </Table.Td>

      {detailed && (
        <Table.Td>
          <NumberInput
            value={circuit.cosPhi}
            size="xs"
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            onChange={(v) => patch({ cosPhi: typeof v === 'number' ? v : circuit.cosPhi })}
          />
        </Table.Td>
      )}

      {detailed && (
        <Table.Td>
          <Select
            data={SCHEDULE_OPTIONS}
            value={presetKeyFor(circuit.schedule)}
            size="xs"
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(value) => {
              const preset = SCHEDULE_PRESETS.find((p) => p.key === value);
              patch({ schedule: preset?.schedule });
            }}
          />
        </Table.Td>
      )}

      <Table.Td>
        {motor ? (
          <Select
            data={STARTER_OPTIONS}
            value={circuit.starterType ?? 'DOL'}
            size="xs"
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(value) => value && patch({ starterType: value as StarterType })}
          />
        ) : (
          <Text size="xs" c="dimmed" ta="center">
            —
          </Text>
        )}
      </Table.Td>

      <Table.Td>
        <Group gap={2} wrap="nowrap" justify="flex-end">
          {pointsCapable && (
            <Tooltip
              label={
                pointCount > 0
                  ? t('builder.editPointsCount', { count: pointCount })
                  : t('builder.editPoints')
              }
            >
              <ActionIcon
                variant={pointCount > 0 ? 'light' : 'subtle'}
                color="indigo"
                aria-label={t('builder.editPoints')}
                onClick={points.open}
              >
                {circuit.loadKind === 'lighting' ? <IconBulb size={16} /> : <IconPlug size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
          {pointsCapable && pointsOpen && (
            <PointsEditor
              panelId={panelId}
              circuit={circuit}
              opened={pointsOpen}
              onClose={points.close}
            />
          )}
          <Popover width={240} position="bottom-end" withinPortal shadow="md">
            <Popover.Target>
              <Tooltip label={t('builder.overrides')}>
                <ActionIcon
                  variant={hasOverride ? 'light' : 'subtle'}
                  color={hasOverride ? 'violet' : 'gray'}
                  aria-label={t('builder.overrides')}
                >
                  <IconAdjustmentsAlt size={16} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {t('builder.overridesHint')}
                </Text>
                <Select
                  label={t('builder.overrideBreaker')}
                  size="xs"
                  data={BREAKER_OVERRIDE_OPTIONS}
                  value={circuit.breakerOverrideA !== undefined ? String(circuit.breakerOverrideA) : 'auto'}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  styles={
                    circuit.breakerOverrideA !== undefined
                      ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                      : undefined
                  }
                  onChange={(v) =>
                    patch({ breakerOverrideA: v && v !== 'auto' ? Number(v) : undefined })
                  }
                />
                <Select
                  label={t('builder.overrideCable')}
                  size="xs"
                  data={CABLE_OVERRIDE_OPTIONS}
                  value={circuit.cableOverrideMm2 !== undefined ? String(circuit.cableOverrideMm2) : 'auto'}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  styles={
                    circuit.cableOverrideMm2 !== undefined
                      ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                      : undefined
                  }
                  onChange={(v) =>
                    patch({ cableOverrideMm2: v && v !== 'auto' ? Number(v) : undefined })
                  }
                />
              </Stack>
            </Popover.Dropdown>
          </Popover>
          <Tooltip label={t('builder.duplicateCircuit')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t('builder.duplicateCircuit')}
              onClick={() => duplicateCircuit(panelId, circuit.id)}
            >
              <IconCopyPlus size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('builder.copyCircuit')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t('builder.copyCircuit')}
              onClick={() => copyCircuit(panelId, circuit.id)}
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('builder.deleteCircuit')}>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('builder.deleteCircuit')}
              onClick={() => removeCircuit(panelId, circuit.id)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * A bulk-action bar shown when one or more circuits are selected: set a common
 * cable length / demand factor / load kind across the selection, or delete them.
 * Each action applies in a single undoable step and then clears the selection.
 */
function BulkActionBar({
  panelId,
  ids,
  onDone,
}: {
  panelId: string;
  ids: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const bulkUpdateCircuits = useProjectStore((s) => s.bulkUpdateCircuits);
  const removeCircuits = useProjectStore((s) => s.removeCircuits);

  // Stage edits locally and commit once on Apply — committing on every onChange
  // applied "2" of "25" to every selected circuit and dismissed the bar before
  // the second digit could be typed.
  const [lengthM, setLengthM] = useState<number | string>('');
  const [demandFactor, setDemandFactor] = useState<number | string>('');
  const [loadKind, setLoadKind] = useState<LoadKind | null>(null);

  const patch = useMemo(() => {
    const p: Partial<CircuitInput> = {};
    if (typeof lengthM === 'number') p.lengthM = lengthM;
    if (typeof demandFactor === 'number') p.demandFactor = demandFactor;
    if (loadKind) {
      p.loadKind = loadKind;
      p.isLighting = loadKind === 'lighting';
    }
    return p;
  }, [lengthM, demandFactor, loadKind]);

  const apply = () => {
    if (Object.keys(patch).length === 0) return;
    bulkUpdateCircuits(panelId, ids, patch);
    onDone();
  };

  return (
    <Paper withBorder radius="md" p="xs" mt="sm" bg="var(--mantine-color-blue-light)">
      <Group gap="sm" wrap="wrap" align="flex-end">
        <Text size="sm" fw={600}>
          {t('builder.selected', { count: ids.length })}
        </Text>
        <NumberInput
          label={t('builder.cableLength')}
          size="xs"
          w={120}
          min={0}
          step={5}
          suffix=" m"
          placeholder={t('builder.cableLengthPlaceholder')}
          value={lengthM}
          onChange={setLengthM}
        />
        <NumberInput
          label={t('builder.demandFactor')}
          size="xs"
          w={120}
          min={0}
          max={1}
          step={0.05}
          decimalScale={2}
          placeholder={t('builder.demandFactorPlaceholder')}
          value={demandFactor}
          onChange={setDemandFactor}
        />
        <Select
          label={t('builder.loadKind')}
          data={LOAD_KIND_OPTIONS}
          size="xs"
          w={150}
          placeholder={t('builder.loadKindPlaceholder')}
          comboboxProps={{ withinPortal: true }}
          value={loadKind}
          onChange={(value) => setLoadKind((value as LoadKind | null) ?? null)}
        />
        <Button size="xs" disabled={Object.keys(patch).length === 0} onClick={apply}>
          {t('builder.bulkApply')}
        </Button>
        <Button
          size="xs"
          color="red"
          variant="light"
          leftSection={<IconTrash size={14} />}
          onClick={() => {
            removeCircuits(panelId, ids);
            onDone();
          }}
        >
          {t('builder.bulkDelete')}
        </Button>
      </Group>
    </Paper>
  );
}

/** Stable empty list so the selector keeps referential equality when the panel is missing. */
const NO_CIRCUITS: CircuitInput[] = [];

/** Structured editor for a panel's branch circuits; recomputes the panel live. */
export function CircuitTable({ panelId }: { panelId: string }) {
  const { t } = useTranslation();
  const circuits = useProjectStore(
    (s) => s.project.panels.find((p) => p.id === panelId)?.circuits ?? NO_CIRCUITS,
  );
  const addCircuit = useProjectStore((s) => s.addCircuit);
  const pasteCircuit = useProjectStore((s) => s.pasteCircuit);
  const hasClipboard = useProjectStore(selectHasClipboard);

  const [wizardOpened, wizard] = useDisclosure(false);

  // Progressive disclosure: Simple hides the cosφ / usage-schedule columns so a
  // first-time user only sees name, kind, load and length. Persisted locally.
  const [detailMode, setDetailMode] = useLocalStorage<'simple' | 'detailed'>({
    key: 'panelmaker:circuit-detail',
    defaultValue: 'simple',
  });
  const detailed = detailMode === 'detailed';

  // Local selection state for bulk editing, keyed by circuit id.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const branches = circuits.filter((c) => c.role === 'branch');

  // Keep the selection consistent with the live circuit set (e.g. after deletes).
  const branchIds = useMemo(() => branches.map((c) => c.id), [branches]);
  const selectedIds = useMemo(
    () => branchIds.filter((id) => selected.has(id)),
    [branchIds, selected],
  );

  const clearSelection = () => setSelected(new Set());

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected = branchIds.length > 0 && selectedIds.length === branchIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div>
      <Group justify="flex-end" mb={6}>
        <SegmentedControl
          size="xs"
          data={[
            { value: 'simple', label: t('builder.modeSimple') },
            { value: 'detailed', label: t('builder.modeDetailed') },
          ]}
          value={detailMode}
          onChange={(v) => setDetailMode(v === 'detailed' ? 'detailed' : 'simple')}
        />
      </Group>
      <Table.ScrollContainer minWidth={detailed ? 900 : 660}>
        <Table verticalSpacing="xs" highlightOnHover stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  size="xs"
                  aria-label={t('builder.selectAllCircuits')}
                  disabled={branchIds.length === 0}
                  onChange={(e) =>
                    setSelected(e.currentTarget.checked ? new Set(branchIds) : new Set())
                  }
                />
              </Table.Th>
              <Table.Th>{t('builder.colName')}</Table.Th>
              <Table.Th w={130}>{t('builder.colKind')}</Table.Th>
              <Table.Th w={120}>{t('builder.colLoad')}</Table.Th>
              <Table.Th w={100}>{t('builder.colLength')}</Table.Th>
              {detailed && <Table.Th w={80}>{t('builder.colPf')}</Table.Th>}
              {detailed && <Table.Th w={170}>{t('builder.colUsage')}</Table.Th>}
              <Table.Th w={160}>{t('builder.colStarter')}</Table.Th>
              <Table.Th w={108} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {branches.map((c) => (
              <CircuitRow
                key={c.id}
                panelId={panelId}
                circuit={c}
                selected={selected.has(c.id)}
                detailed={detailed}
                onToggle={(checked) => toggleOne(c.id, checked)}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {branches.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="md">
          {t('builder.noBranches')}
        </Text>
      )}

      {selectedIds.length > 0 && (
        <BulkActionBar panelId={panelId} ids={selectedIds} onDone={clearSelection} />
      )}

      <Group justify="flex-start" mt="sm">
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          size="xs"
          onClick={() => addCircuit(panelId)}
        >
          {t('builder.addCircuit')}
        </Button>
        <Button
          leftSection={<IconWand size={16} />}
          variant="light"
          color="grape"
          size="xs"
          onClick={wizard.open}
        >
          {t('builder.newCircuitWizard')}
        </Button>
        <Button
          leftSection={<IconClipboard size={16} />}
          variant="default"
          size="xs"
          disabled={!hasClipboard}
          onClick={() => pasteCircuit(panelId)}
        >
          {t('builder.pasteCircuit')}
        </Button>
      </Group>

      <CircuitWizard panelId={panelId} opened={wizardOpened} onClose={wizard.close} />
    </div>
  );
}
