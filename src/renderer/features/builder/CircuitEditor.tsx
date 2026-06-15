import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
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
  ActionIcon,
} from '@mantine/core';
import { IconBulb, IconPlugConnected, IconPlus, IconTrash } from '@tabler/icons-react';
import type {
  CableType,
  CircuitInput,
  CircuitResult,
  LightFixture,
  LoadKind,
  SocketOutlet,
  StarterType,
} from '@shared/types';
import {
  LOAD_KINDS,
  LOAD_DEFAULTS,
  LIGHTING_FIXTURE_PRESETS,
  APPLIANCE_PRESETS,
  SCHEDULE_PRESETS,
  STANDARD_BREAKER_RATINGS_A,
  presetKeyFor,
} from '@shared/standards';
import type { FixturePreset } from '@shared/standards/fixtures';
import { derivedPointsLoadW } from '@shared/engine/fixtures';
import { STANDARD_SECTIONS_MM2 } from '@shared/standards/conductors';
import { circuitOrderCodes } from '@shared/engine/bom';
import { partsForBrand } from '@shared/data/catalog';
import { DebouncedNumberInput, DebouncedTextInput } from '@renderer/features/builder/DebouncedField';
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

function rid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A generic calculator row: a named item at a per-unit wattage × quantity. */
interface CalcRow {
  id: string;
  name: string;
  watts: number;
  qty: number;
}

/** Match a row back to a preset (for the picker), else "custom". */
function presetIdFor(presets: readonly FixturePreset[], row: CalcRow): string {
  const hit = presets.find((p) => p.id !== 'custom' && p.label === row.name && p.watts === row.watts);
  return hit ? hit.id : 'custom';
}

/**
 * Quick load calculator: tally items (light fittings, or household appliances)
 * at their typical wattages — the connected load is the sum. Generic over the
 * preset library + rows; the parent maps the rows to the circuit's fixtures[]
 * (lighting) or sockets[] (small power) so the engine derives the load.
 */
function LoadCalculator({
  icon,
  title,
  addLabel,
  emptyLabel,
  customLabel,
  presets,
  defaultPresetId,
  rows,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  addLabel: string;
  emptyLabel: string;
  customLabel: string;
  presets: readonly FixturePreset[];
  defaultPresetId: string;
  rows: CalcRow[];
  onChange: (next: CalcRow[]) => void;
}) {
  const { t } = useTranslation();
  const total = rows.reduce((s, r) => s + Math.max(0, r.watts) * Math.max(0, r.qty), 0);
  const count = rows.reduce((s, r) => s + Math.max(0, r.qty), 0);
  const patchRow = (id: string, p: Partial<CalcRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const addRow = () => {
    const p = presets.find((x) => x.id === defaultPresetId) ?? presets[0]!;
    onChange([...rows, { id: rid('row'), name: p.label, watts: p.watts, qty: 1 }]);
  };
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Group gap={6}>
          {icon}
          <Text size="sm" fw={600}>
            {title}
          </Text>
        </Group>
        <Button size="compact-xs" variant="light" leftSection={<IconPlus size={14} />} onClick={addRow}>
          {addLabel}
        </Button>
      </Group>
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">
          {emptyLabel}
        </Text>
      ) : (
        <Stack gap={6}>
          {rows.map((r) => (
            <Group key={r.id} gap={6} wrap="nowrap" align="center">
              <Select
                style={{ flex: 1 }}
                size="xs"
                data={presets.map((p) => ({ value: p.id, label: p.label }))}
                value={presetIdFor(presets, r)}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(v) => {
                  const p = presets.find((x) => x.id === v);
                  if (!p) return;
                  patchRow(r.id, p.id === 'custom' ? { name: customLabel } : { name: p.label, watts: p.watts });
                }}
              />
              <NumberInput
                size="xs"
                w={82}
                min={0}
                suffix=" W"
                value={r.watts}
                onChange={(v) => patchRow(r.id, { watts: typeof v === 'number' ? v : 0 })}
              />
              <Text size="xs" c="dimmed">
                ×
              </Text>
              <NumberInput
                size="xs"
                w={64}
                min={0}
                value={r.qty}
                onChange={(v) => patchRow(r.id, { qty: typeof v === 'number' ? v : 0 })}
              />
              <Text size="xs" w={60} ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(Math.max(0, r.watts) * Math.max(0, r.qty))} W
              </Text>
              <ActionIcon variant="subtle" color="red" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {t('lightCalc.summary', { count })}
        </Text>
        <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {(total / 1000).toFixed(2)} kW · {total} W
        </Text>
      </Group>
    </Stack>
  );
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
          <DebouncedTextInput
            variant="unstyled"
            size="md"
            value={circuit.name}
            aria-label={t('builder.colName')}
            onCommit={(name) => patch({ name })}
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

        {/* Cable-focused editor (opened by double-clicking the cable) shows ONLY
            the cable run — the device/load fields belong to the load editor. */}
        {focus !== 'cable' && (
          <>
        <Divider label={t('circuitEditor.device')} />

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
            <DebouncedNumberInput
              label={t('circuitEditor.motorKw')}
              value={circuit.motorKw ?? 0}
              min={0}
              step={0.5}
              decimalScale={1}
              suffix=" kW"
              onCommit={(v) => patch({ motorKw: v })}
            />
          ) : (circuit.fixtures?.length ?? 0) > 0 || (circuit.sockets?.length ?? 0) > 0 ? (
            <NumberInput
              label={t('builder.colLoad')}
              description={(circuit.sockets?.length ?? 0) > 0 ? t('lightCalc.fromAppliances') : t('lightCalc.fromFittings')}
              value={(derivedPointsLoadW(circuit) ?? circuit.loadW) / 1000}
              readOnly
              decimalScale={2}
              suffix=" kW"
            />
          ) : (
            <DebouncedNumberInput
              label={t('builder.colLoad')}
              value={circuit.loadW / 1000}
              min={0}
              step={0.5}
              decimalScale={2}
              suffix=" kW"
              onCommit={(v) => patch({ loadW: v * 1000 })}
            />
          )}
          <DebouncedNumberInput
            label={t('builder.colPf')}
            value={circuit.cosPhi}
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            onCommit={(v) => patch({ cosPhi: v })}
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

        {/* Lighting load calculator — tally fittings; the load derives from them. */}
        {circuit.loadKind === 'lighting' && (
          <>
            <Divider label={t('lightCalc.title')} />
            <LoadCalculator
              icon={<IconBulb size={15} />}
              title={t('lightCalc.title')}
              addLabel={t('lightCalc.add')}
              emptyLabel={t('lightCalc.empty')}
              customLabel={t('lightCalc.custom')}
              presets={LIGHTING_FIXTURE_PRESETS}
              defaultPresetId="downlight12"
              rows={(circuit.fixtures ?? []).map((f) => ({
                id: f.id,
                name: f.name,
                watts: f.wattsPerFitting,
                qty: f.qty,
              }))}
              onChange={(next) => {
                const total = next.reduce((s, r) => s + Math.max(0, r.watts) * Math.max(0, r.qty), 0);
                const fixtures: LightFixture[] = next.map((r) => ({
                  id: r.id,
                  name: r.name,
                  wattsPerFitting: r.watts,
                  qty: r.qty,
                }));
                // Keep loadW in step; clearing all rows reverts to the manual kW field.
                patch(fixtures.length > 0 ? { fixtures, loadW: total } : { fixtures: undefined });
              }}
            />
          </>
        )}

        {/* Small-power / socket appliance calculator. */}
        {(circuit.loadKind === 'socket' || circuit.loadKind === 'general') && (
          <>
            <Divider label={t('applianceCalc.title')} />
            <LoadCalculator
              icon={<IconPlugConnected size={15} />}
              title={t('applianceCalc.title')}
              addLabel={t('applianceCalc.add')}
              emptyLabel={t('applianceCalc.empty')}
              customLabel={t('applianceCalc.custom')}
              presets={APPLIANCE_PRESETS}
              defaultPresetId="socket"
              rows={(circuit.sockets ?? []).map((s) => ({
                id: s.id,
                name: s.name,
                watts: s.vaPerPoint ?? 200,
                qty: s.qty,
              }))}
              onChange={(next) => {
                const total = next.reduce((s, r) => s + Math.max(0, r.watts) * Math.max(0, r.qty), 0);
                const sockets: SocketOutlet[] = next.map((r) => ({
                  id: r.id,
                  name: r.name,
                  qty: r.qty,
                  type: 'dedicated',
                  vaPerPoint: r.watts,
                }));
                patch(sockets.length > 0 ? { sockets, loadW: total } : { sockets: undefined });
              }}
            />
          </>
        )}
          </>
        )}

        <Divider label={t('circuitEditor.cableSection')} />

        {/* Cable run */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <DebouncedNumberInput
            label={t('builder.colLength')}
            value={circuit.lengthM}
            min={0}
            step={5}
            suffix=" m"
            onCommit={(v) => patch({ lengthM: v })}
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
            label={t('circuitEditor.laying')}
            data={[
              { value: 'air', label: t('circuitEditor.layingAir') },
              { value: 'ground', label: t('circuitEditor.layingGround') },
            ]}
            value={circuit.laying ?? 'air'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            styles={
              circuit.laying === 'ground'
                ? { input: { color: 'var(--mantine-color-violet-6)', fontWeight: 600 } }
                : undefined
            }
            onChange={(v) => patch({ laying: v === 'ground' ? 'ground' : undefined })}
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

        {circuit.loadKind !== 'spare' && <Divider label={t('circuitEditor.advanced')} />}

        {!isFeederCircuit && circuit.loadKind !== 'spare' && (
          <Switch
            label={t('circuitEditor.lifeSafety')}
            description={t('circuitEditor.lifeSafetyHint')}
            color="red"
            checked={circuit.lifeSafety === true}
            onChange={(e) => patch({ lifeSafety: e.currentTarget.checked ? true : undefined })}
          />
        )}

        {isFeederCircuit && (
          <Switch
            label={t('circuitEditor.busway')}
            description={
              result?.busway
                ? t('circuitEditor.buswayRated', { rating: result.busway.ratingA })
                : t('circuitEditor.buswayHint')
            }
            checked={circuit.busway === true}
            onChange={(e) => patch({ busway: e.currentTarget.checked ? true : undefined })}
          />
        )}

        {isFeederCircuit && (
          <Switch
            label={t('circuitEditor.transformer')}
            description={
              result?.transformer
                ? t('circuitEditor.transformerRated', {
                    kva: result.transformer.kva,
                    ka: result.transformer.secondaryFaultKa,
                  })
                : t('circuitEditor.transformerHint')
            }
            checked={circuit.transformer === true}
            onChange={(e) => patch({ transformer: e.currentTarget.checked ? true : undefined })}
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
