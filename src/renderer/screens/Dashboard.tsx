import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import {
  IconBolt,
  IconChartAreaLine,
  IconClockHour4,
  IconCoin,
  IconSun,
  IconTrendingDown,
} from '@tabler/icons-react';
import { computeLoadProfile } from '@shared/engine';
import { computeEnergyEconomics } from '@shared/engine/energy';
import { Stat } from '@renderer/features/components/Stat';
import { formatIdr, formatKw } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

const PALETTE = ['indigo.6', 'teal.6', 'grape.6', 'orange.6', 'blue.6', 'lime.6', 'pink.6', 'cyan.6'];

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Peak-load & energy dashboard: when and where the building peaks. */
export function Dashboard() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const profile = useMemo(() => computeLoadProfile(project), [project]);
  const system = useSystemResult();
  const energy = useMemo(() => computeEnergyEconomics(project, system), [project, system]);

  const data = useMemo(
    () =>
      profile.hourlyKw.map((_, h) => {
        const row: Record<string, number | string> = { hour: hourLabel(h) };
        for (const p of profile.byPanel) row[p.name] = p.hourlyKw[h] ?? 0;
        return row;
      }),
    [profile],
  );
  const series = profile.byPanel.map((p, i) => ({ name: p.name, color: PALETTE[i % PALETTE.length]! }));

  const solarKwh = system.sources?.solar?.dailyKwh ?? 0;
  const offsetPct = profile.dailyKwh > 0 ? Math.min(100, (solarKwh / profile.dailyKwh) * 100) : 0;
  const battery = system.sources?.battery;
  const batteryHoursAtPeak = battery && profile.peakKw > 0 ? battery.usableKwh / profile.peakKw : undefined;

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('dashboard.eyebrow')}
        </Text>
        <Title order={3}>{t('dashboard.title')}</Title>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <Stat
          label={t('dashboard.peakDemand')}
          value={formatKw(profile.peakKw * 1000)}
          icon={<IconBolt size={18} />}
        />
        <Stat
          label={t('dashboard.peakTime')}
          value={hourLabel(profile.peakHour)}
          hint={t('dashboard.busiestHour')}
          icon={<IconClockHour4 size={18} />}
          color="grape"
        />
        <Stat
          label={t('dashboard.dailyEnergy')}
          value={`${profile.dailyKwh} kWh`}
          hint={t('dashboard.loadFactor', { factor: profile.loadFactor })}
          icon={<IconChartAreaLine size={18} />}
          color="orange"
        />
        <Stat
          label={t('dashboard.solarOffset')}
          value={`${Math.round(offsetPct)}%`}
          hint={solarKwh > 0 ? t('dashboard.pvPerDay', { kwh: solarKwh }) : t('dashboard.noPv')}
          icon={<IconSun size={18} />}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600} size="sm">
            {t('dashboard.dailyProfile')}
          </Text>
          <Badge variant="light" color="grape">
            {t('dashboard.peakBadge', { kw: profile.peakKw, time: hourLabel(profile.peakHour) })}
          </Badge>
        </Group>
        {series.length > 0 ? (
          <AreaChart
            h={300}
            data={data}
            dataKey="hour"
            series={series}
            type="stacked"
            curveType="monotone"
            withLegend
            withDots={false}
            unit=" kW"
            referenceLines={[{ x: hourLabel(profile.peakHour), label: 'peak', color: 'red.6' }]}
            tooltipAnimationDuration={150}
          />
        ) : (
          <Text c="dimmed" size="sm" ta="center" py="xl">
            {t('dashboard.noLoadsProfile')}
          </Text>
        )}
        <Text size="xs" c="dimmed" mt="xs">
          {t('dashboard.profileHint')}
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            {t('dashboard.peakContributors', { time: hourLabel(profile.peakHour) })}
          </Text>
          {profile.peakContributors.length > 0 ? (
            <Table verticalSpacing={6} fz="sm">
              <Table.Tbody>
                {profile.peakContributors.map((c) => (
                  <Table.Tr key={c.circuitId}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {c.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.panelName}
                      </Text>
                    </Table.Td>
                    <Table.Td w={160}>
                      <Group gap="xs" wrap="nowrap" justify="flex-end">
                        <Progress
                          value={(c.kw / profile.peakKw) * 100}
                          w={90}
                          color="indigo"
                          size="sm"
                        />
                        <Text size="sm" fw={600} w={56} ta="right">
                          {c.kw} kW
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" size="sm">
              {t('dashboard.noLoadsAtPeak')}
            </Text>
          )}
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="teal">
              <IconSun size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('dashboard.energyAutonomy')}
            </Text>
          </Group>
          <Stack gap={8}>
            <KeyVal k={t('dashboard.dailyConsumption')} v={`${profile.dailyKwh} kWh`} />
            <KeyVal
              k={t('dashboard.solarYield')}
              v={solarKwh > 0 ? t('dashboard.perDay', { kwh: solarKwh }) : t('dashboard.enablePv')}
            />
            <div>
              <Group justify="space-between" mb={2}>
                <Text size="sm" c="dimmed">
                  {t('dashboard.solarOffset')}
                </Text>
                <Text size="sm" fw={600}>
                  {Math.round(offsetPct)}%
                </Text>
              </Group>
              <Progress value={offsetPct} color="teal" />
            </div>
            <KeyVal
              k={t('dashboard.batteryBackup')}
              v={
                battery
                  ? t('dashboard.batteryValue', {
                      kwh: battery.installedKwh,
                      hours: batteryHoursAtPeak?.toFixed(1),
                    })
                  : t('dashboard.enableBattery')
              }
            />
            {system.sources?.generator && (
              <KeyVal
                k={t('dashboard.generator')}
                v={t('dashboard.generatorStandby', { kva: system.sources.generator.ratingKva })}
              />
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" color={system.powerFactor.needed ? 'orange' : 'teal'}>
              <IconBolt size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('dashboard.pfCard')}
            </Text>
          </Group>
          <Badge variant="light" color={system.powerFactor.needed ? 'orange' : 'teal'}>
            {system.powerFactor.needed
              ? t('dashboard.pfCorrectionRecommended')
              : t('dashboard.pfAdequate')}
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
          <KeyValStat k={t('dashboard.existingPf')} v={system.powerFactor.existingPf.toFixed(2)} />
          <KeyValStat k={t('dashboard.targetPf')} v={system.powerFactor.targetPf.toFixed(2)} />
          <KeyValStat
            k={t('dashboard.demand')}
            v={`${system.powerFactor.totalKw} kW · ${system.powerFactor.totalKvar} kVAR`}
          />
          {system.powerFactor.bankKvar > 0 ? (
            <KeyValStat
              k={t('dashboard.capacitorBank')}
              v={`${system.powerFactor.bankKvar} kVAR (${system.powerFactor.steps}×${system.powerFactor.stepKvar})`}
            />
          ) : (
            <KeyValStat k={t('dashboard.capacitorBank')} v={t('dashboard.notRequired')} />
          )}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {system.powerFactor.note}
        </Text>
      </Card>

      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('dashboard.roiEyebrow')}
        </Text>
        <Title order={4} mt={2}>
          {t('dashboard.roiTitle')}
        </Title>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <Stat
          label={t('dashboard.systemLosses')}
          value={formatKw(energy.losses.totalLossW)}
          hint={t('dashboard.ofDemand', { percent: energy.losses.lossPercent })}
          icon={<IconTrendingDown size={18} />}
          color="orange"
        />
        <Stat
          label={t('dashboard.copperLoss')}
          value={formatKw(energy.losses.copperLossW)}
          hint={t('dashboard.conductorHeating')}
          icon={<IconBolt size={18} />}
          color="grape"
        />
        <Stat
          label={t('dashboard.monthlyEnergyCost')}
          value={formatIdr(energy.monthlyEnergyCost)}
          hint={`${energy.monthlyKwh.toLocaleString('id-ID')} kWh @ ${energy.tariffIdrPerKwh.toLocaleString('id-ID')}/kWh`}
          icon={<IconCoin size={18} />}
          color="teal"
        />
        <Stat
          label={t('dashboard.solarPayback')}
          value={
            energy.solar.paybackYears !== undefined
              ? t('dashboard.paybackYears', { years: energy.solar.paybackYears })
              : '—'
          }
          hint={
            energy.solar.paybackYears !== undefined
              ? t('dashboard.beforeEscalation')
              : t('dashboard.noPv')
          }
          icon={<IconSun size={18} />}
          color="yellow"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="orange">
              <IconTrendingDown size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('dashboard.lossCostBreakdown')}
            </Text>
          </Group>
          <Table verticalSpacing={6} fz="sm" withRowBorders={false}>
            <Table.Tbody>
              <RoiRow k={t('dashboard.copperLossRow')} v={formatKw(energy.losses.copperLossW)} />
              <RoiRow
                k={t('dashboard.transformerLoss')}
                v={energy.losses.transformerLossW > 0 ? formatKw(energy.losses.transformerLossW) : t('dashboard.lvSupply')}
              />
              <RoiRow k={t('dashboard.totalLoss')} v={`${formatKw(energy.losses.totalLossW)} · ${energy.losses.lossPercent}%`} strong />
              <RoiRow k={t('dashboard.dailyEnergyRow')} v={`${energy.dailyKwh.toLocaleString('id-ID')} kWh (+${energy.dailyLossKwh} kWh loss)`} />
              <RoiRow k={t('dashboard.monthlyEnergyCost')} v={formatIdr(energy.monthlyEnergyCost)} strong />
              <RoiRow k={t('dashboard.annualLossCost')} v={formatIdr(energy.annualLossCost)} />
            </Table.Tbody>
          </Table>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="yellow">
              <IconSun size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('dashboard.solarBatteryEconomics')}
            </Text>
          </Group>
          {energy.solar.capex > 0 || energy.battery.capex > 0 ? (
            <Table verticalSpacing={6} fz="sm" withRowBorders={false}>
              <Table.Tbody>
                <RoiRow k={t('dashboard.solarCapex')} v={energy.solar.capex > 0 ? formatIdr(energy.solar.capex) : '—'} />
                <RoiRow k={t('dashboard.annualSolarSavings')} v={energy.solar.annualSavings > 0 ? formatIdr(energy.solar.annualSavings) : '—'} />
                <RoiRow
                  k={t('dashboard.simplePayback')}
                  v={energy.solar.paybackYears !== undefined ? t('dashboard.paybackYears', { years: energy.solar.paybackYears }) : '—'}
                  strong
                />
                <RoiRow k={t('dashboard.lifetimeNet')} v={energy.solar.capex > 0 ? formatIdr(energy.solar.lifetimeNet) : '—'} />
                <RoiRow k={t('dashboard.batteryCapex')} v={energy.battery.capex > 0 ? formatIdr(energy.battery.capex) : '—'} />
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" size="sm" py="sm">
              {t('dashboard.enableRoi')}
            </Text>
          )}
        </Card>
      </SimpleGrid>

      {energy.notes.length > 0 && (
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            {t('dashboard.assumptions')}
          </Text>
          <Stack gap={4}>
            {energy.notes.map((note, i) => (
              <Text key={i} size="xs" c="dimmed">
                • {note}
              </Text>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

/** A key/value row for the loss & ROI breakdown tables. */
function RoiRow({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" c={strong ? undefined : 'dimmed'} fw={strong ? 600 : 400}>
          {k}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" fw={strong ? 700 : 500}>
          {v}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

/** Compact key/value stat block for the power-factor card. */
function KeyValStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={700}>
        {v}
      </Text>
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={500} ta="right">
        {v}
      </Text>
    </Group>
  );
}
