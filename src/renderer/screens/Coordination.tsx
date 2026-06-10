import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconChartLine, IconDownload, IconInfoCircle } from '@tabler/icons-react';
import type { SelectivityEntry } from '@shared/types';
import { buildTccSvg, type TccDevice } from '@shared/drawing/tccCurve';
import { downloadSvg } from '@renderer/lib/download';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

/** The two devices (upstream feeder, downstream largest branch) of a pair. */
function devicesForPair(
  entry: SelectivityEntry,
  panels: ReturnType<typeof useSystemResult>['panels'],
): TccDevice[] {
  const devices: TccDevice[] = [];
  const upstream = panels[entry.upstreamPanelId]?.circuits.find(
    (c) => c.circuitId === entry.upstreamCircuitId,
  );
  if (upstream) {
    devices.push({
      label: `${entry.upstreamName} (${upstream.breaker.ratingA} A ${upstream.breaker.curve})`,
      deviceClass: upstream.breaker.deviceClass,
      curve: upstream.breaker.curve,
      ratingA: upstream.breaker.ratingA,
    });
  }
  const child = panels[entry.downstreamPanelId];
  const largest = child?.circuits.reduce(
    (best, c) => (c.breaker.ratingA > (best?.breaker.ratingA ?? 0) ? c : best),
    undefined as (typeof child.circuits)[number] | undefined,
  );
  if (largest) {
    devices.push({
      label: `${largest.name} (${largest.breaker.ratingA} A ${largest.breaker.curve})`,
      deviceClass: largest.breaker.deviceClass,
      curve: largest.breaker.curve,
      ratingA: largest.breaker.ratingA,
    });
  }
  return devices;
}

/** Time-current coordination curves + the discrimination report. */
export function Coordination() {
  const { t } = useTranslation();
  const projectName = useProjectStore((s) => s.project.name);
  const system = useSystemResult();
  const pairs = system.selectivity ?? [];

  const [pairKey, setPairKey] = useState<string | null>(null);
  const activeKey = pairKey ?? (pairs[0] ? `${pairs[0].upstreamCircuitId}:${pairs[0].downstreamPanelId}` : null);
  const active = pairs.find((e) => `${e.upstreamCircuitId}:${e.downstreamPanelId}` === activeKey);

  const svg = useMemo(() => {
    if (!active) return null;
    const devices = devicesForPair(active, system.panels);
    if (devices.length === 0) return null;
    return buildTccSvg({
      devices,
      faultA: active.downstreamFaultA,
      widthPx: 860,
      heightPx: 520,
    });
  }, [active, system.panels]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('coordination.eyebrow')}
          </Text>
          <Title order={3}>{t('coordination.title')}</Title>
        </div>
        {svg && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={() => downloadSvg(`${projectName} - coordination.svg`, svg)}
          >
            {t('coordination.exportSvg')}
          </Button>
        )}
      </Group>

      {pairs.length === 0 ? (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} title={t('coordination.noPairsTitle')}>
          {t('coordination.noPairsBody')}
        </Alert>
      ) : (
        <>
          <Card withBorder radius="md" padding="md">
            <Group gap="md" align="flex-end" mb="sm">
              <IconChartLine size={18} color="var(--mantine-color-indigo-6)" />
              <Select
                label={t('coordination.pair')}
                data={pairs.map((e) => ({
                  value: `${e.upstreamCircuitId}:${e.downstreamPanelId}`,
                  label: `${e.upstreamName} → ${e.downstreamName}`,
                }))}
                value={activeKey}
                allowDeselect={false}
                onChange={setPairKey}
                maw={420}
              />
              {active && (
                <Group gap={6}>
                  <Badge variant="light" color={active.selective ? 'teal' : 'red'}>
                    {t('coordination.overload')}: {active.ratio}×
                  </Badge>
                  {active.selectivityLimitA !== undefined && (
                    <Badge variant="light" color={active.scSelective === false ? 'orange' : 'teal'}>
                      {t('coordination.scLimit', { amps: active.selectivityLimitA })}
                    </Badge>
                  )}
                  {active.downstreamFaultA !== undefined && (
                    <Badge variant="light" color="gray">
                      {t('coordination.faultThere', { ka: (active.downstreamFaultA / 1000).toFixed(1) })}
                    </Badge>
                  )}
                </Group>
              )}
            </Group>
            {svg && (
              <Box
                style={{ overflowX: 'auto' }}
                // Our own DOM-free SVG builder output (all text XML-escaped).
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
            <Text size="xs" c="dimmed" mt="xs">
              {t('coordination.disclaimer')}
            </Text>
          </Card>

          <Card withBorder radius="md" padding="md">
            <Text fw={600} size="sm" mb="xs">
              {t('coordination.tableTitle')}
            </Text>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('coordination.colFeeder')}</Table.Th>
                    <Table.Th>{t('coordination.colPanel')}</Table.Th>
                    <Table.Th>{t('coordination.colRatings')}</Table.Th>
                    <Table.Th>{t('coordination.colRatio')}</Table.Th>
                    <Table.Th>{t('coordination.colOverload')}</Table.Th>
                    <Table.Th>{t('coordination.colShortCircuit')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pairs.map((e) => (
                    <Table.Tr key={`${e.upstreamCircuitId}:${e.downstreamPanelId}`}>
                      <Table.Td>{e.upstreamName}</Table.Td>
                      <Table.Td>{e.downstreamName}</Table.Td>
                      <Table.Td>
                        {e.upstreamRatingA} A → {e.downstreamRatingA} A
                      </Table.Td>
                      <Table.Td>{e.ratio}×</Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={e.selective ? 'teal' : 'red'}>
                          {e.selective ? t('coordination.selective') : t('coordination.atRisk')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {e.selectivityLimitA !== undefined ? (
                          <Badge
                            size="sm"
                            variant="light"
                            color={e.scSelective === false ? 'orange' : 'teal'}
                          >
                            {e.scSelective === false
                              ? t('coordination.partialTo', { amps: e.selectivityLimitA })
                              : t('coordination.fullUpTo', { amps: e.selectivityLimitA })}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </>
      )}

      <Card withBorder radius="md" padding="md">
        <Text fw={600} size="sm" mb="xs">
          {t('coordination.panelSummary')}
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('coordination.colPanel')}</Table.Th>
                <Table.Th>{t('coordination.colFault')}</Table.Th>
                <Table.Th>{t('coordination.colBusbarIcw')}</Table.Th>
                <Table.Th>{t('coordination.colArcFlash')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {system.order.map((id) => {
                const p = system.panels[id];
                if (!p) return null;
                return (
                  <Table.Tr key={id}>
                    <Table.Td>{p.name}</Table.Td>
                    <Table.Td>{p.faultLevelKa !== undefined ? `${p.faultLevelKa} kA` : '—'}</Table.Td>
                    <Table.Td>
                      {p.busbar.withstand ? (
                        <Badge
                          size="sm"
                          variant="light"
                          color={p.busbar.withstand.adequate ? 'teal' : 'red'}
                        >
                          {p.busbar.withstand.icwKa} kA
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {p.arcFlash
                        ? `${p.arcFlash.incidentEnergyCalCm2} cal/cm² · ${p.arcFlash.ppeCategory}`
                        : '—'}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
