import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconBolt, IconCash, IconSitemap, IconSolarPanel, IconStack2 } from '@tabler/icons-react';
import type { SystemResult } from '@shared/types';
import { partsForBrand } from '@shared/data/catalog';
import { formatDaya } from '@shared/standards';
import { costSystem } from '@renderer/lib/bom';
import { panelLabel } from '@shared/labels';
import { formatAmps, formatIdr, formatKw } from '@renderer/lib/format';
import { Stat } from '@renderer/features/components/Stat';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

/**
 * The system information dashboard — its own sidebar screen, so the single-line
 * canvas page stays uncluttered. Totals, the PLN supply/transformer/metering
 * design, prospective fault levels, selectivity and the energy-source sizing,
 * all read-only projections of the computed system (plus the dual-transformer
 * design switch, which lives with the supply facts it changes).
 */
export function SystemInfo() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const preferredBrand = useProjectStore((s) => s.preferredBrand);
  const system = useSystemResult();

  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystem(system, partsForBrand(parts, preferredBrand), priceMap);
  }, [system, parts, preferredBrand, prices]);

  const sup = system.supply;

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('system.eyebrow')}
        </Text>
        <Title order={3}>{t('nav.overview')}</Title>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Stat
          label={t('system.connectedLoad')}
          value={formatKw(system.totals.connectedLoadW)}
          icon={<IconBolt size={18} />}
        />
        <Stat
          label={t('system.panels')}
          value={system.totals.panelCount}
          hint={t('system.inThisBuilding')}
          icon={<IconStack2 size={18} />}
          color="grape"
        />
        <Stat
          label={t('system.estimatedCost')}
          // A confident "Rp 0" reads as broken when nothing is priced yet — show
          // a dash and let the hint prompt importing a pricelist.
          value={cost.grandTotal > 0 ? formatIdr(cost.grandTotal) : '—'}
          hint={
            cost.unmatchedCount > 0
              ? t('system.unpricedLines', { count: cost.unmatchedCount })
              : t('system.allPriced')
          }
          icon={<IconCash size={18} />}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb={sup.type === 'MV' ? 'xs' : 4}>
          <Group gap="xs">
            <ThemeIcon variant="light" color={sup.type === 'MV' ? 'orange' : 'teal'}>
              <IconBolt size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('system.supply')}
            </Text>
            <Badge variant="light" color={sup.type === 'MV' ? 'orange' : 'teal'}>
              {sup.type === 'MV' ? t('system.supplyMv') : t('system.supplyLv')}
            </Badge>
          </Group>
          <Group gap="md">
            {project.meta?.dualTransformer === true && (
              <Badge size="sm" variant="light" color="grape">
                {t('system.dualTransformer')}
              </Badge>
            )}
            <Text size="sm" fw={600}>
              {t('system.demandKva', { kva: sup.demandKva })}
            </Text>
          </Group>
        </Group>
        {sup.type === 'MV' && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
            <KeyStat
              k={t('system.transformer')}
              v={`${(sup.transformerCount ?? 1) >= 2 ? '2× ' : ''}${sup.transformerKva} kVA`}
            />
            <KeyStat k={t('system.mvVoltage')} v={`${(sup.mvVoltageV ?? 0) / 1000} kV`} />
            <KeyStat k={t('system.impedance')} v={`${sup.transformerImpedancePct}%`} />
            <KeyStat
              k={t('system.primarySecondary')}
              v={`${formatAmps(sup.transformerPrimaryA ?? 0)} / ${formatAmps(sup.transformerSecondaryA ?? 0)}`}
            />
          </SimpleGrid>
        )}
        <Text size="xs" c="dimmed">
          {sup.note}
        </Text>
        {sup.recommendedDayaVa !== undefined && (
          <Text size="xs" c="dimmed" mt={4}>
            {t('system.dayaLine', {
              recommended: formatDaya(sup.recommendedDayaVa),
              contracted: sup.contractedDayaVa !== undefined
                ? formatDaya(sup.contractedDayaVa)
                : t('system.dayaUncontracted'),
            })}
          </Text>
        )}
        {system.metering && (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mt="sm" mb="xs">
              <KeyStat
                k={t('system.plnService')}
                v={
                  system.metering.mvService
                    ? t('system.plnServiceMv')
                    : `${(system.metering.serviceVa / 1000).toLocaleString('en-US')} kVA`
                }
              />
              <KeyStat k={t('system.serviceCurrent')} v={formatAmps(system.metering.serviceCurrentA)} />
              <KeyStat
                k={t('system.metering')}
                v={
                  system.metering.metering === 'direct'
                    ? t('system.meteringDirect')
                    : t('system.meteringCt')
                }
              />
              {system.metering.ctRatio && (
                <KeyStat
                  k={t('system.ct')}
                  v={`${system.metering.ctRatio} · ${system.metering.ctClass}`}
                />
              )}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              {system.metering.note}
            </Text>
          </>
        )}
      </Card>

      <FaultLevelsCard system={system} />

      <SelectivityCard system={system} />

      {system.sources && (
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" color="green">
              <IconSolarPanel size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              {t('system.energySources')}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {system.sources.generator && (
              <KeyStat k={t('system.generator')} v={`${system.sources.generator.ratingKva} kVA`} />
            )}
            {system.sources.solar && (
              <KeyStat
                k={t('system.solarPv')}
                v={`${system.sources.solar.arrayKwp} kWp · ${system.sources.solar.inverterKw} kW`}
              />
            )}
            {system.sources.battery && (
              <KeyStat k={t('system.battery')} v={`${system.sources.battery.installedKwh} kWh`} />
            )}
          </SimpleGrid>
        </Card>
      )}
    </Stack>
  );
}

/** A compact key/value used in the supply/transformer card. */
function KeyStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={600}>
        {v}
      </Text>
    </div>
  );
}

/**
 * Current-based discrimination report per cascaded feeder→sub-panel pair: the
 * upstream/downstream ratings, their ratio, and whether the rule-of-thumb screen
 * is met. Full coordination still needs manufacturer time-current curves.
 */
function SelectivityCard({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const rows = system.selectivity;
  if (!rows || rows.length === 0) return null;

  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="xs" mb="xs">
        <ThemeIcon variant="light" color="indigo">
          <IconSitemap size={16} />
        </ThemeIcon>
        <Text fw={600} size="sm">
          {t('system.selectivity')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('system.selectivityHint')}
        </Text>
      </Group>
      <Table.ScrollContainer minWidth={520}>
        <Table verticalSpacing="xs" fz="sm" withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('system.selColFeeder')}</Table.Th>
              <Table.Th w={90}>{t('system.selColUpstream')}</Table.Th>
              <Table.Th>{t('system.selColSubPanel')}</Table.Th>
              <Table.Th w={100}>{t('system.selColDownstream')}</Table.Th>
              <Table.Th w={70}>{t('system.selColRatio')}</Table.Th>
              <Table.Th w={110}>{t('system.selColDiscrimination')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((e) => (
              <Table.Tr key={`${e.upstreamCircuitId}-${e.downstreamPanelId}`}>
                <Table.Td>{e.upstreamName}</Table.Td>
                <Table.Td>{formatAmps(e.upstreamRatingA)}</Table.Td>
                <Table.Td>{e.downstreamName}</Table.Td>
                <Table.Td>{formatAmps(e.downstreamRatingA)}</Table.Td>
                <Table.Td>{e.ratio.toFixed(2)}×</Table.Td>
                <Table.Td>
                  {/* A current-ratio SCREEN, not a type-tested verdict — amber
                      "review" rather than a red "fail" so it doesn't assert more
                      than it computes. */}
                  <Badge variant="light" color={e.selective ? 'teal' : 'orange'} size="sm">
                    {e.selective ? t('system.selOk') : t('system.selRisk')}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="xs">
        {t('system.selectivityScreenNote')}
      </Text>
    </Card>
  );
}

/**
 * Prospective short-circuit (Isc) at each panel's bus, root-first. The fault
 * decays down feeder runs; a panel is flagged when one of its devices cannot
 * break the fault present at it.
 */
function FaultLevelsCard({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const rows = system.order
    .map((id) => system.panels[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.faultLevelKa !== undefined);
  if (rows.length === 0) return null;

  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="xs" mb="xs">
        <ThemeIcon variant="light" color="red">
          <IconBolt size={16} />
        </ThemeIcon>
        <Text fw={600} size="sm">
          {t('system.faultLevels')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('system.faultLevelsHint')}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
        {rows.map((p) => {
          const inadequate = p.warnings.some((w) => w.code === 'breaking-capacity-inadequate');
          return (
            <Group key={p.panelId} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate>
                {panelLabel(p)}
              </Text>
              <Badge variant={inadequate ? 'filled' : 'light'} color={inadequate ? 'red' : 'gray'}>
                {p.faultLevelKa} kA
              </Badge>
            </Group>
          );
        })}
      </SimpleGrid>
    </Card>
  );
}
