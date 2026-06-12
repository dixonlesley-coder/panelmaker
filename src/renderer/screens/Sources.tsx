import { useTranslation } from 'react-i18next';
import {
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconBattery, IconBolt, IconSun } from '@tabler/icons-react';
import type { BatteryConfig, GeneratorConfig, GeneratorMode, SolarConfig } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';
import {
  DEFAULT_BATTERY as DEFAULT_BATT,
  DEFAULT_GENERATOR as DEFAULT_GEN,
  DEFAULT_SOLAR,
} from '@renderer/data/sourceDefaults';

/** Computed-result strip shown under an enabled source. */
function ResultBlock({ stats, note }: { stats: [string, string][]; note: string }) {
  return (
    <Card withBorder mt="sm" padding="sm" radius="sm" bg="var(--mantine-color-default-hover)">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
        {stats.map(([k, v]) => (
          <div key={k}>
            <Text size="xs" c="dimmed">
              {k}
            </Text>
            <Text size="sm" fw={700}>
              {v}
            </Text>
          </div>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt="xs">
        {note}
      </Text>
    </Card>
  );
}

function SourceHeader({
  icon,
  title,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <ThemeIcon variant="light" color={enabled ? 'indigo' : 'gray'}>
          {icon}
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
      </Group>
      <Switch checked={enabled} onChange={(e) => onToggle(e.currentTarget.checked)} />
    </Group>
  );
}

/** Configure distributed energy sources and see them sized against the demand. */
export function Sources() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const updateSources = useProjectStore((s) => s.updateSources);
  const system = useSystemResult();

  const gen: GeneratorConfig = { ...DEFAULT_GEN, ...project.sources?.generator };
  const solar: SolarConfig = { ...DEFAULT_SOLAR, ...project.sources?.solar };
  const batt: BatteryConfig = { ...DEFAULT_BATT, ...project.sources?.battery };
  const res = system.sources;

  // When any panel is marked essential, the genset sizes to those panels and the
  // whole-building backup fraction no longer applies. Same for UPS-backed
  // (critical) panels and the battery's manual backup kW.
  const essentialCount = project.panels.filter((p) => p.essential === true).length;
  const criticalCount = project.panels.filter((p) => p.upsBacked === true).length;

  const setGen = (p: Partial<GeneratorConfig>) => updateSources({ generator: { ...gen, ...p } });
  const setSolar = (p: Partial<SolarConfig>) => updateSources({ solar: { ...solar, ...p } });
  const setBatt = (p: Partial<BatteryConfig>) => updateSources({ battery: { ...batt, ...p } });

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('sources.eyebrow')}
        </Text>
        <Title order={3}>{t('sources.title')}</Title>
        <Text size="sm" c="dimmed">
          {t('sources.demandIntro', { kva: system.supply.demandKva })}
        </Text>
      </div>

      {/* Generator */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconBolt size={16} />}
          title={t('sources.generator')}
          enabled={gen.enabled}
          onToggle={(v) => setGen({ enabled: v })}
        />
        {gen.enabled && (
          <>
            {essentialCount > 0 && (
              <Text size="xs" c="dimmed" mt="sm">
                {t('sources.essentialActive', { count: essentialCount })}
              </Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="sm">
              <NumberInput
                label={t('sources.backupOfDemand')}
                description={t('sources.backupOfDemandHint')}
                value={Math.round(gen.backupFraction * 100)}
                min={10}
                max={100}
                step={5}
                disabled={essentialCount > 0}
                onChange={(v) => setGen({ backupFraction: (typeof v === 'number' ? v : 100) / 100 })}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  {t('sources.duty')}
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { value: 'standby', label: t('sources.dutyStandby') },
                    { value: 'prime', label: t('sources.dutyPrime') },
                  ]}
                  value={gen.mode}
                  onChange={(v) => setGen({ mode: v as GeneratorMode })}
                />
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  {t('sources.transfer')}
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { value: 'ats', label: t('sources.transferAts') },
                    { value: 'manual', label: t('sources.transferManual') },
                  ]}
                  value={gen.transfer ?? 'ats'}
                  onChange={(v) => setGen({ transfer: v as 'ats' | 'manual' })}
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {t('sources.transferHint')}
                </Text>
              </div>
            </SimpleGrid>
            {res?.generator && (
              <ResultBlock
                note={res.generator.note}
                stats={[
                  [t('sources.gensetRating'), `${res.generator.ratingKva} kVA`],
                  [t('sources.backupLoad'), `${res.generator.backupKva} kVA`],
                  [t('sources.duty'), res.generator.mode],
                ]}
              />
            )}
            {res?.gensetStart && res.gensetStart.startingKva > 0 && (
              <ResultBlock
                note={res.gensetStart.note}
                stats={[
                  [
                    t('sources.startDip'),
                    `${res.gensetStart.estimatedDipPct}% ${
                      res.gensetStart.acceptable
                        ? t('sources.startDipOk')
                        : t('sources.startDipHigh')
                    }`,
                  ],
                  [t('sources.startKva'), `${res.gensetStart.startingKva} kVA`],
                  [
                    t('sources.limitingMotor'),
                    res.gensetStart.limitingMotorName ?? '—',
                  ],
                  [t('sources.minGensetForStart'), `${res.gensetStart.recommendedMinGensetKva} kVA`],
                ]}
              />
            )}
          </>
        )}
      </Card>

      {/* Solar PV */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconSun size={16} />}
          title={t('sources.solarPv')}
          enabled={solar.enabled}
          onToggle={(v) => setSolar({ enabled: v })}
        />
        {solar.enabled && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="sm">
              <NumberInput
                label={t('sources.targetArray')}
                value={solar.targetKwp}
                min={1}
                step={5}
                onChange={(v) => setSolar({ targetKwp: typeof v === 'number' ? v : solar.targetKwp })}
              />
              <NumberInput
                label={t('sources.panelPower')}
                value={solar.panelWp}
                min={100}
                step={10}
                onChange={(v) => setSolar({ panelWp: typeof v === 'number' ? v : solar.panelWp })}
              />
              <NumberInput
                label={t('sources.dcAcRatio')}
                value={solar.dcAcRatio}
                min={1}
                max={1.5}
                step={0.05}
                decimalScale={2}
                onChange={(v) => setSolar({ dcAcRatio: typeof v === 'number' ? v : solar.dcAcRatio })}
              />
            </SimpleGrid>
            {res?.solar && (
              <ResultBlock
                note={res.solar.note}
                stats={[
                  [t('sources.panels'), `${res.solar.panelCount} × ${res.solar.panelWp} Wp`],
                  [t('sources.array'), `${res.solar.arrayKwp} kWp`],
                  [t('sources.inverter'), `${res.solar.inverterKw} kW`],
                  [t('sources.strings'), `${res.solar.strings} × ${res.solar.stringSize}`],
                  [t('sources.dailyYield'), `${res.solar.dailyKwh} kWh`],
                ]}
              />
            )}
          </>
        )}
      </Card>

      {/* Battery */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconBattery size={16} />}
          title={t('sources.battery')}
          enabled={batt.enabled}
          onToggle={(v) => setBatt({ enabled: v })}
        />
        {batt.enabled && (
          <>
            {criticalCount > 0 && (
              <Text size="xs" c="dimmed" mt="sm">
                {t('sources.criticalActive', { count: criticalCount })}
              </Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="sm">
              <NumberInput
                label={t('sources.backupLoadKw')}
                description={t('sources.backupLoadKwHint')}
                value={batt.backupKw}
                min={1}
                step={1}
                disabled={criticalCount > 0}
                onChange={(v) => setBatt({ backupKw: typeof v === 'number' ? v : batt.backupKw })}
              />
              <NumberInput
                label={t('sources.autonomyHours')}
                value={batt.autonomyHours}
                min={0.5}
                step={0.5}
                decimalScale={1}
                onChange={(v) =>
                  setBatt({ autonomyHours: typeof v === 'number' ? v : batt.autonomyHours })
                }
              />
              <Select
                label={t('sources.chemistry')}
                data={[
                  { value: 'lifepo4', label: 'LiFePO4' },
                  { value: 'lead_acid', label: 'Lead-acid' },
                ]}
                value={batt.chemistry}
                allowDeselect={false}
                onChange={(v) => v && setBatt({ chemistry: v as BatteryConfig['chemistry'] })}
              />
            </SimpleGrid>
            {res?.battery && (
              <ResultBlock
                note={res.battery.note}
                stats={[
                  [t('sources.required'), `${res.battery.requiredKwh} kWh`],
                  [t('sources.installed'), `${res.battery.installedKwh} kWh`],
                  [t('sources.modules'), `${res.battery.moduleCount} × ${res.battery.moduleKwh} kWh`],
                  [t('sources.inverter'), `${res.battery.inverterKw} kW`],
                ]}
              />
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
