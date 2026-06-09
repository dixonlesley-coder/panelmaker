import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Stepper,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import type { CircuitInput, LoadKind, StartingDuty, StarterType } from '@shared/types';
import { LOAD_KINDS, LOAD_DEFAULTS } from '@shared/standards';
import { useProjectStore } from '@renderer/state/projectStore';

/** Load-kind options (full catalog), shared with the inline editor. */
const LOAD_KIND_OPTIONS = LOAD_KINDS.map((k) => ({ value: k, label: LOAD_DEFAULTS[k].label }));

/** Starter-type options offered for motor/pump circuits in the wizard. */
const STARTER_OPTIONS: { value: StarterType; label: string }[] = [
  { value: 'DOL', label: 'DOL (direct on-line)' },
  { value: 'STAR_DELTA', label: 'Star-delta (Y-Δ)' },
  { value: 'REVERSING', label: 'Reversing' },
  { value: 'SOFT_STARTER', label: 'Soft starter' },
  { value: 'VFD', label: 'VFD' },
  { value: 'PUMP', label: 'Pump controller' },
];

/** Starting-duty options. */
const DUTY_OPTIONS: { value: StartingDuty; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'jogging', label: 'Jogging' },
];

/** Common motor pole counts and their synchronous speeds (50 Hz). */
const POLE_OPTIONS = [
  { value: '2', label: '2-pole (~2900 rpm)' },
  { value: '4', label: '4-pole (~1450 rpm)' },
  { value: '6', label: '6-pole (~960 rpm)' },
  { value: '8', label: '8-pole (~720 rpm)' },
];

/** True for circuits sized from motor kW rather than connected W. */
function isMotorKind(kind: LoadKind): boolean {
  return kind === 'motor' || kind === 'pump';
}

/** The mutable draft the wizard collects before building a CircuitInput. */
interface Draft {
  name: string;
  loadKind: LoadKind;
  // non-motor params
  loadKw: number;
  cosPhi: number;
  lengthM: number;
  demandFactor: number;
  isLighting: boolean;
  // motor params
  motorKw: number;
  motorPoles: number;
  starterType: StarterType;
  startingDuty: StartingDuty;
}

/** A fresh draft seeded from a load kind's catalog defaults. */
function defaultDraft(): Draft {
  const d = LOAD_DEFAULTS.general;
  return {
    name: 'New circuit',
    loadKind: 'general',
    loadKw: 1,
    cosPhi: d.cosPhi,
    lengthM: 20,
    demandFactor: d.demandFactor,
    isLighting: false,
    motorKw: 5.5,
    motorPoles: 4,
    starterType: 'DOL',
    startingDuty: 'normal',
  };
}

/** Re-seed pf / demand / lighting flags when the user changes the load kind. */
function applyKind(draft: Draft, kind: LoadKind): Draft {
  const d = LOAD_DEFAULTS[kind];
  return {
    ...draft,
    loadKind: kind,
    cosPhi: d.cosPhi,
    demandFactor: d.demandFactor,
    isLighting: kind === 'lighting',
  };
}

/** Convert the collected draft into the circuit payload (id assigned by the store). */
function draftToCircuit(draft: Draft): Omit<CircuitInput, 'id'> {
  const motor = isMotorKind(draft.loadKind);
  const base: Omit<CircuitInput, 'id'> = {
    name: draft.name.trim() || 'New circuit',
    role: 'branch',
    loadW: motor ? 0 : Math.max(0, draft.loadKw) * 1000,
    cosPhi: draft.cosPhi,
    lengthM: draft.lengthM,
    loadKind: draft.loadKind,
    isLighting: draft.isLighting,
    demandFactor: draft.demandFactor,
  };
  if (motor) {
    return {
      ...base,
      motorKw: draft.motorKw,
      motorPoles: draft.motorPoles,
      starterType: draft.starterType,
      startingDuty: draft.startingDuty,
    };
  }
  return base;
}

/** A compact key/value row used in the review step. */
function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <Table.Tr>
      <Table.Td c="dimmed">{k}</Table.Td>
      <Table.Td ta="right" fw={500}>
        {v}
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * A guided three-step modal for building a circuit: pick the load kind, fill in
 * its parameters, then review and confirm. On confirm the fully-configured
 * circuit is appended to the panel via {@link addCircuitConfigured}.
 */
export function CircuitWizard({
  panelId,
  opened,
  onClose,
}: {
  panelId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const addCircuitConfigured = useProjectStore((s) => s.addCircuitConfigured);
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<Draft>(defaultDraft);

  const motor = isMotorKind(draft.loadKind);
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const reset = () => {
    setActive(0);
    setDraft(defaultDraft());
  };

  const close = () => {
    onClose();
    reset();
  };

  const confirm = () => {
    addCircuitConfigured(panelId, draftToCircuit(draft));
    close();
  };

  const kindLabel = LOAD_DEFAULTS[draft.loadKind].label;

  return (
    <Modal opened={opened} onClose={close} title={t('builder.wizardTitle')} size="lg" centered>
      <Stepper active={active} onStepClick={setActive} size="sm">
        <Stepper.Step label={t('builder.wizStepKind')} description={t('builder.wizStepKindDesc')}>
          <Stack gap="sm" mt="md">
            <TextInput
              label={t('builder.wizCircuitName')}
              value={draft.name}
              onChange={(e) => set({ name: e.currentTarget.value })}
            />
            <Select
              label={t('builder.wizLoadKind')}
              data={LOAD_KIND_OPTIONS}
              value={draft.loadKind}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(v) => v && setDraft((prev) => applyKind(prev, v as LoadKind))}
            />
            <Text size="xs" c="dimmed">
              {motor ? t('builder.wizMotorNote') : t('builder.wizFinalNote')}
            </Text>
          </Stack>
        </Stepper.Step>

        <Stepper.Step
          label={t('builder.wizStepParams')}
          description={t('builder.wizStepParamsDesc')}
        >
          <Stack gap="sm" mt="md">
            {motor ? (
              <>
                <NumberInput
                  label={t('builder.wizMotorRating')}
                  value={draft.motorKw}
                  min={0}
                  step={0.5}
                  decimalScale={1}
                  suffix=" kW"
                  onChange={(v) => set({ motorKw: typeof v === 'number' ? v : 0 })}
                />
                <Select
                  label={t('builder.wizPoles')}
                  data={POLE_OPTIONS}
                  value={String(draft.motorPoles)}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  onChange={(v) => v && set({ motorPoles: Number(v) })}
                />
                <Select
                  label={t('builder.wizStarterType')}
                  data={STARTER_OPTIONS}
                  value={draft.starterType}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  onChange={(v) => v && set({ starterType: v as StarterType })}
                />
                <Select
                  label={t('builder.wizStartingDuty')}
                  data={DUTY_OPTIONS}
                  value={draft.startingDuty}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  onChange={(v) => v && set({ startingDuty: v as StartingDuty })}
                />
              </>
            ) : (
              <>
                <NumberInput
                  label={t('builder.wizConnectedLoad')}
                  value={draft.loadKw}
                  min={0}
                  step={0.5}
                  decimalScale={2}
                  suffix=" kW"
                  onChange={(v) => set({ loadKw: typeof v === 'number' ? v : 0 })}
                />
                <NumberInput
                  label={t('builder.wizPowerFactor')}
                  value={draft.cosPhi}
                  min={0.1}
                  max={1}
                  step={0.05}
                  decimalScale={2}
                  onChange={(v) => set({ cosPhi: typeof v === 'number' ? v : draft.cosPhi })}
                />
                <Switch
                  label={t('builder.wizLightingSwitch')}
                  checked={draft.isLighting}
                  onChange={(e) => set({ isLighting: e.currentTarget.checked })}
                />
              </>
            )}
            <NumberInput
              label={t('builder.wizCableLength')}
              value={draft.lengthM}
              min={0}
              step={5}
              suffix=" m"
              onChange={(v) => set({ lengthM: typeof v === 'number' ? v : 0 })}
            />
            <NumberInput
              label={t('builder.wizDemandFactor')}
              value={draft.demandFactor}
              min={0}
              max={1}
              step={0.05}
              decimalScale={2}
              onChange={(v) => set({ demandFactor: typeof v === 'number' ? v : draft.demandFactor })}
            />
          </Stack>
        </Stepper.Step>

        <Stepper.Step
          label={t('builder.wizStepReview')}
          description={t('builder.wizStepReviewDesc')}
        >
          <Table mt="md" verticalSpacing="xs" fz="sm">
            <Table.Tbody>
              <ReviewRow k={t('builder.wizRowName')} v={draft.name.trim() || 'New circuit'} />
              <ReviewRow k={t('builder.wizRowLoadKind')} v={kindLabel} />
              {motor ? (
                <>
                  <ReviewRow k={t('builder.wizRowMotorRating')} v={`${draft.motorKw} kW`} />
                  <ReviewRow k={t('builder.wizRowPoles')} v={String(draft.motorPoles)} />
                  <ReviewRow
                    k={t('builder.wizRowStarter')}
                    v={STARTER_OPTIONS.find((o) => o.value === draft.starterType)?.label ?? ''}
                  />
                  <ReviewRow
                    k={t('builder.wizRowStartingDuty')}
                    v={DUTY_OPTIONS.find((o) => o.value === draft.startingDuty)?.label ?? ''}
                  />
                </>
              ) : (
                <>
                  <ReviewRow k={t('builder.wizRowConnectedLoad')} v={`${draft.loadKw} kW`} />
                  <ReviewRow k={t('builder.wizRowPowerFactor')} v={draft.cosPhi.toFixed(2)} />
                  <ReviewRow
                    k={t('builder.wizRowLighting')}
                    v={draft.isLighting ? t('common.yes') : t('common.no')}
                  />
                </>
              )}
              <ReviewRow k={t('builder.wizRowCableLength')} v={`${draft.lengthM} m`} />
              <ReviewRow k={t('builder.wizRowDemandFactor')} v={draft.demandFactor.toFixed(2)} />
            </Table.Tbody>
          </Table>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between" mt="lg">
        <Button variant="default" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Group gap="xs">
          {active > 0 && (
            <Button variant="default" onClick={() => setActive((a) => a - 1)}>
              {t('common.back')}
            </Button>
          )}
          {active < 2 ? (
            <Button onClick={() => setActive((a) => a + 1)}>{t('common.next')}</Button>
          ) : (
            <Button onClick={confirm}>{t('builder.wizAdd')}</Button>
          )}
        </Group>
      </Group>
    </Modal>
  );
}
