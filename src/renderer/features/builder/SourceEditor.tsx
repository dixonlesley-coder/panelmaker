import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type {
  BatteryConfig,
  GeneratorConfig,
  GeneratorMode,
  SolarConfig,
} from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

export type SourceKind = 'solar' | 'battery' | 'generator';

export const DEFAULT_GENERATOR: GeneratorConfig = { enabled: true, backupFraction: 1, mode: 'standby' };
export const DEFAULT_SOLAR: SolarConfig = { enabled: true, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 };
export const DEFAULT_BATTERY: BatteryConfig = {
  enabled: true,
  backupKw: 10,
  autonomyHours: 4,
  chemistry: 'lifepo4',
};

/** Compact label/value pair for a source's sized output. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={700}>
        {value}
      </Text>
    </div>
  );
}

/**
 * Edit a distributed energy source (solar PV + inverter, battery + inverter, or
 * generator) from the single-line — opened by dropping a source card or double-
 * clicking its node. Edits are project-level (sources size against building
 * demand) and recompute live.
 */
export function SourceEditor({
  kind,
  opened,
  onClose,
}: {
  kind: SourceKind;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sources = useProjectStore((s) => s.project.sources);
  const updateSources = useProjectStore((s) => s.updateSources);
  const sized = useSystemResult().sources;

  const gen: GeneratorConfig = { ...DEFAULT_GENERATOR, ...sources?.generator };
  const solar: SolarConfig = { ...DEFAULT_SOLAR, ...sources?.solar };
  const batt: BatteryConfig = { ...DEFAULT_BATTERY, ...sources?.battery };

  const title =
    kind === 'solar'
      ? t('sourceEditor.solarTitle')
      : kind === 'battery'
        ? t('sourceEditor.batteryTitle')
        : t('sourceEditor.generatorTitle');

  const remove = () => {
    if (kind === 'solar') updateSources({ solar: { ...solar, enabled: false } });
    else if (kind === 'battery') updateSources({ battery: { ...batt, enabled: false } });
    else updateSources({ generator: { ...gen, enabled: false } });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={title}>
      <Stack gap="md">
        {kind === 'solar' && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <NumberInput
                label={t('sourceEditor.targetKwp')}
                value={solar.targetKwp}
                min={1}
                step={5}
                suffix=" kWp"
                onChange={(v) => updateSources({ solar: { ...solar, targetKwp: typeof v === 'number' ? v : solar.targetKwp } })}
              />
              <NumberInput
                label={t('sourceEditor.panelWp')}
                value={solar.panelWp}
                min={100}
                step={10}
                suffix=" Wp"
                onChange={(v) => updateSources({ solar: { ...solar, panelWp: typeof v === 'number' ? v : solar.panelWp } })}
              />
              <NumberInput
                label={t('sourceEditor.dcAc')}
                value={solar.dcAcRatio}
                min={1}
                max={1.6}
                step={0.05}
                decimalScale={2}
                onChange={(v) => updateSources({ solar: { ...solar, dcAcRatio: typeof v === 'number' ? v : solar.dcAcRatio } })}
              />
            </SimpleGrid>
            {sized?.solar && (
              <>
                <Divider label={t('sourceEditor.sized')} />
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                  <Stat label={t('sourceEditor.array')} value={`${sized.solar.arrayKwp} kWp`} />
                  <Stat label={t('sourceEditor.inverter')} value={`${sized.solar.inverterKw} kW`} />
                  <Stat label={t('sourceEditor.strings')} value={`${sized.solar.strings}×${sized.solar.stringSize}`} />
                  <Stat label={t('sourceEditor.daily')} value={`${sized.solar.dailyKwh} kWh`} />
                </SimpleGrid>
              </>
            )}
          </>
        )}

        {kind === 'battery' && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <NumberInput
                label={t('sourceEditor.backupKw')}
                value={batt.backupKw}
                min={1}
                step={1}
                suffix=" kW"
                onChange={(v) => updateSources({ battery: { ...batt, backupKw: typeof v === 'number' ? v : batt.backupKw } })}
              />
              <NumberInput
                label={t('sourceEditor.autonomy')}
                value={batt.autonomyHours}
                min={0.5}
                step={0.5}
                decimalScale={1}
                suffix=" h"
                onChange={(v) => updateSources({ battery: { ...batt, autonomyHours: typeof v === 'number' ? v : batt.autonomyHours } })}
              />
              <Select
                label={t('sourceEditor.chemistry')}
                data={[
                  { value: 'lifepo4', label: 'LiFePO₄' },
                  { value: 'lead_acid', label: 'Lead-acid' },
                ]}
                value={batt.chemistry}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(v) => v && updateSources({ battery: { ...batt, chemistry: v as BatteryConfig['chemistry'] } })}
              />
            </SimpleGrid>
            {sized?.battery && (
              <>
                <Divider label={t('sourceEditor.sized')} />
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                  <Stat label={t('sourceEditor.installed')} value={`${sized.battery.installedKwh} kWh`} />
                  <Stat label={t('sourceEditor.usable')} value={`${sized.battery.usableKwh} kWh`} />
                  <Stat label={t('sourceEditor.modules')} value={`${sized.battery.moduleCount}×${sized.battery.moduleKwh}`} />
                  <Stat label={t('sourceEditor.inverter')} value={`${sized.battery.inverterKw} kW`} />
                </SimpleGrid>
              </>
            )}
          </>
        )}

        {kind === 'generator' && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <NumberInput
                label={t('sourceEditor.backupPct')}
                value={Math.round(gen.backupFraction * 100)}
                min={10}
                max={100}
                step={5}
                suffix=" %"
                onChange={(v) => updateSources({ generator: { ...gen, backupFraction: (typeof v === 'number' ? v : 100) / 100 } })}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  {t('sourceEditor.duty')}
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { value: 'standby', label: t('sources.dutyStandby') },
                    { value: 'prime', label: t('sources.dutyPrime') },
                  ]}
                  value={gen.mode}
                  onChange={(v) => updateSources({ generator: { ...gen, mode: v as GeneratorMode } })}
                />
              </div>
            </SimpleGrid>
            {sized?.generator && (
              <>
                <Divider label={t('sourceEditor.sized')} />
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                  <Stat label={t('sourceEditor.rating')} value={`${sized.generator.ratingKva} kVA`} />
                  <Stat label={t('sourceEditor.backupLoad')} value={`${sized.generator.backupKva} kVA`} />
                  <Stat label={t('sourceEditor.duty')} value={sized.generator.mode} />
                </SimpleGrid>
              </>
            )}
          </>
        )}

        <Group justify="space-between" mt="xs">
          <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={remove}>
            {t('sourceEditor.remove')}
          </Button>
          <Button size="xs" onClick={onClose}>
            {t('circuitEditor.done')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
