import { useMemo } from 'react';
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
import { IconBolt, IconChartAreaLine, IconClockHour4, IconSun } from '@tabler/icons-react';
import { computeLoadProfile, computeSystem } from '@shared/engine';
import { Stat } from '@renderer/features/components/Stat';
import { formatKw } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';

const PALETTE = ['indigo.6', 'teal.6', 'grape.6', 'orange.6', 'blue.6', 'lime.6', 'pink.6', 'cyan.6'];

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Peak-load & energy dashboard: when and where the building peaks. */
export function Dashboard() {
  const project = useProjectStore((s) => s.project);
  const profile = useMemo(() => computeLoadProfile(project), [project]);
  const system = useMemo(() => computeSystem(project), [project]);

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
          Energy & peak load
        </Text>
        <Title order={3}>Dashboard</Title>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <Stat label="Peak demand" value={formatKw(profile.peakKw * 1000)} icon={<IconBolt size={18} />} />
        <Stat
          label="Peak time"
          value={hourLabel(profile.peakHour)}
          hint="busiest hour"
          icon={<IconClockHour4 size={18} />}
          color="grape"
        />
        <Stat
          label="Daily energy"
          value={`${profile.dailyKwh} kWh`}
          hint={`load factor ${profile.loadFactor}`}
          icon={<IconChartAreaLine size={18} />}
          color="orange"
        />
        <Stat
          label="Solar offset"
          value={`${Math.round(offsetPct)}%`}
          hint={solarKwh > 0 ? `${solarKwh} kWh/day PV` : 'no PV configured'}
          icon={<IconSun size={18} />}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600} size="sm">
            24-hour load profile
          </Text>
          <Badge variant="light" color="grape">
            peak {profile.peakKw} kW at {hourLabel(profile.peakHour)}
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
            No loads to profile yet.
          </Text>
        )}
        <Text size="xs" c="dimmed" mt="xs">
          Stacked by panel — taller bands show where the building load concentrates over the day.
          Continuous loads form the base; scheduled loads (daytime AC, overnight EV) shape the curve.
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            Peak contributors — {hourLabel(profile.peakHour)}
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
              No loads at the peak hour.
            </Text>
          )}
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="teal">
              <IconSun size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              Energy & autonomy
            </Text>
          </Group>
          <Stack gap={8}>
            <KeyVal k="Daily consumption" v={`${profile.dailyKwh} kWh`} />
            <KeyVal k="Solar yield" v={solarKwh > 0 ? `${solarKwh} kWh/day` : '— (enable PV)'} />
            <div>
              <Group justify="space-between" mb={2}>
                <Text size="sm" c="dimmed">
                  Solar offset
                </Text>
                <Text size="sm" fw={600}>
                  {Math.round(offsetPct)}%
                </Text>
              </Group>
              <Progress value={offsetPct} color="teal" />
            </div>
            <KeyVal
              k="Battery backup"
              v={
                battery
                  ? `${battery.installedKwh} kWh · ~${batteryHoursAtPeak?.toFixed(1)} h at peak`
                  : '— (enable battery)'
              }
            />
            {system.sources?.generator && (
              <KeyVal k="Generator" v={`${system.sources.generator.ratingKva} kVA standby`} />
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
              Power factor &amp; capacitor bank
            </Text>
          </Group>
          <Badge variant="light" color={system.powerFactor.needed ? 'orange' : 'teal'}>
            {system.powerFactor.needed ? 'correction recommended' : 'PF adequate'}
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
          <KeyValStat k="Existing PF" v={system.powerFactor.existingPf.toFixed(2)} />
          <KeyValStat k="Target PF" v={system.powerFactor.targetPf.toFixed(2)} />
          <KeyValStat
            k="Demand"
            v={`${system.powerFactor.totalKw} kW · ${system.powerFactor.totalKvar} kVAR`}
          />
          {system.powerFactor.bankKvar > 0 ? (
            <KeyValStat
              k="Capacitor bank"
              v={`${system.powerFactor.bankKvar} kVAR (${system.powerFactor.steps}×${system.powerFactor.stepKvar})`}
            />
          ) : (
            <KeyValStat k="Capacitor bank" v="not required" />
          )}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {system.powerFactor.note}
        </Text>
      </Card>
    </Stack>
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
