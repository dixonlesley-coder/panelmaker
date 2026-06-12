import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Divider,
  Group,
  List,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconBulb, IconTrash } from '@tabler/icons-react';
import type { CableType, CircuitInput, CircuitResult, LoadKind, StarterType } from '@shared/types';
import {
  LOAD_KINDS,
  LOAD_DEFAULTS,
  SCHEDULE_PRESETS,
  STANDARD_BREAKER_RATINGS_A,
  presetKeyFor,
} from '@shared/standards';
import { STANDARD_SECTIONS_MM2 } from '@shared/standards/conductors';
import { circuitOrderCodes } from '@shared/engine/bom';
import { partsForBrand } from '@shared/data/catalog';
import { useProjectStore } from '@renderer/state/projectStore';
import { formatAmps, formatPercent } from '@renderer/lib/format';

const LOAD_KIND_OPTIONS = LOAD_KINDS.map((k) => ({ value: k, label: LOAD_DEFAULTS[k].label }));
const SCHEDULE_OPTIONS = SCHEDULE_PRESETS.map((p) => ({ value: p.key, label: p.label }));
const STARTER_OPTIONS: { value: StarterType; label: string }[] = [
  { value: 'DOL', label: 'DOL (direct on-line)' },
  { value: 'STAR_DELTA', label: 'Star-delta (Y-Δ)' },
  { value: 'REVERSING', label: 'Reversing' },
  { value: 'SOFT_STARTER', label: 'Soft starter' },
  { value: 'VFD', label: 'VFD' },
  { value: 'PUMP', label: 'Pump controller' },
];
const BREAKER_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...STANDARD_BREAKER_RATINGS_A.map((r) => ({ value: String(r), label: `${r} A` })),
];
const CABLE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...STANDARD_SECTIONS_MM2.map((s) => ({ value: String(s), label: `${s} mm²` })),
];
/** Selectable cable constructions (the catalog stocks these; 'auto' = panel default). */
const CABLE_TYPES: CableType[] = ['NYY', 'NYM', 'NYA', 'NYAF'];

function isMotorKind(kind: LoadKind): boolean {
  return kind === 'motor' || kind === 'pump';
}

/** Cable loading colour: calm < 80%, warm 80–100%, hot ≥ 100%. */
function utilColor(pct: number): string {
  if (pct >= 100) return 'red';
  if (pct >= 80) return 'orange';
  return 'teal';
}

interface Props {
  panelId: string;
  /** The live circuit input (looked up fresh by the parent each recompute). */
  circuit: CircuitInput;
  /** The computed result for this circuit, for the read-only sizing summary. */
  result?: CircuitResult;
  /** Open on the cable section (edge double-click) vs the device section. */
  focus: 'device' | 'cable';
  opened: boolean;
  onClose: () => void;
}

/**
 * Edit one circuit straight from the single-line: device kind/load/starter and
 * the cable run (length, manual section/breaker overrides), with the live sizing
 * summary — breaker, cable, Iz and the **cable utilisation %** of its ampacity.
 * Edits dispatch immediately, so the canvas and this panel recompute live.
 */
export function CircuitEditor({ panelId, circuit, result, focus, opened, onClose }: Props) {
  const { t } = useTranslation();
  const updateCircuit = useProjectStore((s) => s.updateCircuit);
  const removeCircuit = useProjectStore((s) => s.removeCircuit);
  const parts = useProjectStore((s) => s.parts);
  const preferredBrand = useProjectStore((s) => s.preferredBrand);
  const patch = (p: Partial<CircuitInput>) => updateCircuit(panelId, circuit.id, p);
  const motor = isMotorKind(circuit.loadKind);
  // Feeders are three-phase by topology — offering a phase override would lie.
  const isFeederCircuit = circuit.loadKind === 'feeder' || circuit.feedsPanelId !== undefined;
  // The catalog order code the BOM would match for this device (selected brand).
  const codes = result ? circuitOrderCodes(result, partsForBrand(parts, preferredBrand)) : undefined;

  const util =
    result && result.cable.deratedIzA > 0
      ? Math.round((result.designCurrentA / result.cable.deratedIzA) * 100)
      : undefined;

  // Plain-language "why these sizes" — turns the engine's governing constraint
  // (ampacity vs voltage-drop vs a manual override) into something a junior
  // engineer can read and trust, instead of leaving the numbers unexplained.
  const reasons: string[] = [];
  if (result) {
    reasons.push(
      result.breaker.overridden
        ? t('circuitEditor.whyBreakerManual', { rating: result.breaker.ratingA })
        : t('circuitEditor.whyBreaker', {
            rating: result.breaker.ratingA,
            design: formatAmps(result.designCurrentA),
          }),
    );
    const csa = `${result.cable.runsPerPhase && result.cable.runsPerPhase > 1 ? `${result.cable.runsPerPhase}× ` : ''}${result.cable.csaMm2}`;
    if (result.cable.overridden) {
      reasons.push(t('circuitEditor.whyCableManual', { csa }));
    } else if (result.cable.vdDriven) {
      reasons.push(t('circuitEditor.whyCableVd', { csa, limit: result.voltageDrop.limitPercent }));
    } else {
      reasons.push(t('circuitEditor.whyCableAmpacity', { csa, iz: formatAmps(result.cable.deratedIzA) }));
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <TextInput
            variant="unstyled"
            size="md"
            value={circuit.name}
            aria-label={t('builder.colName')}
            onChange={(e) => patch({ name: e.currentTarget.value })}
            styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
          />
        </Group>
      }
    >
      <Stack gap="md">
        {/* Live sizing summary (read-only) — leads with utilisation. */}
        {result && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
            <Stat label={t('circuitEditor.design')} value={formatAmps(result.designCurrentA)} />
            <Stat
              label={t('circuitEditor.breaker')}
              value={`${result.breaker.ratingA} A ${result.breaker.curve}`}
              color={result.breaker.overridden ? 'violet' : undefined}
              hint={codes?.breaker}
            />
            <Stat
              label={t('circuitEditor.cable')}
              value={`${result.cable.runsPerPhase && result.cable.runsPerPhase > 1 ? `${result.cable.runsPerPhase}× ` : ''}${result.cable.csaMm2} mm²`}
              color={result.cable.overridden ? 'violet' : undefined}
              hint={codes?.cable}
            />
            <Stat
              label={t('circuitEditor.utilisation')}
              value={util !== undefined ? `${util}%` : '—'}
              color={util !== undefined ? utilColor(util) : undefined}
              hint={`Iz ${formatAmps(result.cable.deratedIzA)}`}
            />
          </SimpleGrid>
        )}
        {result && (
          <Text size="xs" c={result.voltageDrop.withinLimit ? 'dimmed' : 'red'}>
            {t('circuitEditor.vdrop', {
              pct: formatPercent(result.voltageDrop.dropPercent),
              limit: result.voltageDrop.limitPercent,
            })}
            {result.cumulativeDropPercent !== undefined
              ? ` · ${t('circuitEditor.cumulative', { pct: formatPercent(result.cumulativeDropPercent) })}`
              : ''}
          </Text>
        )}
        {reasons.length > 0 && (
          <Alert variant="light" color="blue" p="xs" icon={<IconBulb size={16} />} title={t('circuitEditor.whyTitle')}>
            <List size="xs" spacing={3}>
              {reasons.map((r, i) => (
                <List.Item key={i}>{r}</List.Item>
              ))}
            </List>
          </Alert>
        )}

        <Divider label={focus === 'cable' ? t('circuitEditor.cableSection') : t('circuitEditor.device')} />

        {/* Device */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label={t('builder.colKind')}
            data={LOAD_KIND_OPTIONS}
            value={circuit.loadKind}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => {
              if (!v) return;
              const kind = v as LoadKind;
              patch({
                loadKind: kind,
                isLighting: kind === 'lighting',
                ...(isMotorKind(kind)
                  ? { motorKw: circuit.motorKw ?? 5.5, starterType: circuit.starterType ?? 'DOL' }
                  : {}),
              });
            }}
          />
          {motor ? (
            <NumberInput
              label={t('circuitEditor.motorKw')}
              value={circuit.motorKw ?? 0}
              min={0}
              step={0.5}
              decimalScale={1}
              suffix=" kW"
              onChange={(v) => patch({ motorKw: typeof v === 'number' ? v : 0 })}
            />
          ) : (
            <NumberInput
              label={t('builder.colLoad')}
              value={circuit.loadW / 1000}
              min={0}
              step={0.5}
              decimalScale={2}
              suffix=" kW"
              onChange={(v) => patch({ loadW: (typeof v === 'number' ? v : 0) * 1000 })}
            />
          )}
          <NumberInput
            label={t('builder.colPf')}
            value={circuit.cosPhi}
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            onChange={(v) => patch({ cosPhi: typeof v === 'number' ? v : circuit.cosPhi })}
          />
          {motor && (
            <Select
              label={t('builder.colStarter')}
              data={STARTER_OPTIONS}
              value={circuit.starterType ?? 'DOL'}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(v) => v && patch({ starterType: v as StarterType })}
            />
          )}
          {!isFeederCircuit && (
            <Select
              label={t('circuitEditor.phases')}
              description={t('circuitEditor.phasesHint')}
              data={[
                { value: 'auto', label: t('circuitEditor.phasesAuto') },
                { value: '1', label: t('circuitEditor.phases1') },
                { value: '3', label: t('circuitEditor.phases3') },
              ]}
              value={circuit.phases !== undefined ? String(circuit.phases) : 'auto'}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              styles={
                circuit.phases !== undefined
                  ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                  : undefined
              }
              onChange={(v) => patch({ phases: v === '1' ? 1 : v === '3' ? 3 : undefined })}
            />
          )}
          <Select
            label={t('builder.colUsage')}
            data={SCHEDULE_OPTIONS}
            value={presetKeyFor(circuit.schedule)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => patch({ schedule: SCHEDULE_PRESETS.find((p) => p.key === v)?.schedule })}
          />
        </SimpleGrid>

        <Divider label={t('circuitEditor.cableSection')} />

        {/* Cable run */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            label={t('builder.colLength')}
            value={circuit.lengthM}
            min={0}
            step={5}
            suffix=" m"
            onChange={(v) => patch({ lengthM: typeof v === 'number' ? v : 0 })}
          />
          <Select
            label={t('circuitEditor.cableType')}
            data={[
              { value: 'auto', label: t('circuitEditor.cableTypeAuto') },
              ...CABLE_TYPES.map((ct) => ({ value: ct, label: t(`circuitEditor.cableType${ct}`) })),
            ]}
            value={circuit.cableType ?? 'auto'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            styles={
              circuit.cableType !== undefined
                ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                : undefined
            }
            onChange={(v) => patch({ cableType: v && v !== 'auto' ? (v as CableType) : undefined })}
          />
          <Select
            label={t('builder.overrideCable')}
            data={CABLE_OPTIONS}
            value={circuit.cableOverrideMm2 !== undefined ? String(circuit.cableOverrideMm2) : 'auto'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            styles={
              circuit.cableOverrideMm2 !== undefined
                ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                : undefined
            }
            onChange={(v) => patch({ cableOverrideMm2: v && v !== 'auto' ? Number(v) : undefined })}
          />
          <Select
            label={t('builder.overrideBreaker')}
            data={BREAKER_OPTIONS}
            value={circuit.breakerOverrideA !== undefined ? String(circuit.breakerOverrideA) : 'auto'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            styles={
              circuit.breakerOverrideA !== undefined
                ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                : undefined
            }
            onChange={(v) => patch({ breakerOverrideA: v && v !== 'auto' ? Number(v) : undefined })}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label={t('circuitEditor.phasePin')}
            description={t('circuitEditor.phasePinHint')}
            data={[
              { value: 'auto', label: t('circuitEditor.phaseAuto') },
              { value: 'L1', label: 'L1' },
              { value: 'L2', label: 'L2' },
              { value: 'L3', label: 'L3' },
            ]}
            value={circuit.phaseOverride ?? 'auto'}
            allowDeselect={false}
            disabled={result?.phase === '3ph'}
            comboboxProps={{ withinPortal: true }}
            styles={
              circuit.phaseOverride !== undefined
                ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                : undefined
            }
            onChange={(v) =>
              patch({
                phaseOverride:
                  v && v !== 'auto' ? (v as CircuitInput['phaseOverride']) : undefined,
              })
            }
          />
          <NumberInput
            label={t('circuitEditor.groupingOverride')}
            description={t('circuitEditor.groupingOverrideHint')}
            value={circuit.groupingCountOverride ?? ''}
            placeholder={t('circuitEditor.groupingPanelDefault')}
            min={1}
            max={20}
            onChange={(v) =>
              patch({ groupingCountOverride: typeof v === 'number' ? v : undefined })
            }
          />
        </SimpleGrid>
        {result && (
          <Text size="xs" c="dimmed">
            {t('circuitEditor.makeup', {
              spec: result.grounding.cableSpec,
              iz: formatAmps(result.cable.deratedIzA),
            })}
          </Text>
        )}

        {!isFeederCircuit && circuit.loadKind !== 'spare' && (
          <Switch
            label={t('circuitEditor.lifeSafety')}
            description={t('circuitEditor.lifeSafetyHint')}
            color="red"
            checked={circuit.lifeSafety === true}
            onChange={(e) => patch({ lifeSafety: e.currentTarget.checked ? true : undefined })}
          />
        )}

        <Divider label={t('circuitEditor.busbarSection')} />
        <Switch
          label={t('circuitEditor.busbarBreak')}
          description={t('circuitEditor.busbarBreakHint')}
          checked={circuit.busbarBreakBefore === true}
          onChange={(e) => patch({ busbarBreakBefore: e.currentTarget.checked ? true : undefined })}
        />

        <Group justify="space-between" mt="xs">
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              removeCircuit(panelId, circuit.id);
              onClose();
            }}
          >
            {t('builder.deleteCircuit')}
          </Button>
          <Button size="xs" onClick={onClose}>
            {t('circuitEditor.done')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Compact label/value stat used in the editor's sizing summary. */
function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={700} c={color}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" ff="monospace">
          {hint}
        </Text>
      )}
    </div>
  );
}
