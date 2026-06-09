import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, Group, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileSpreadsheet, IconFileText } from '@tabler/icons-react';
import type { PanelInput } from '@shared/types/project';
import type { CircuitResult, PanelResult } from '@shared/types/results';
import type { Part } from '@shared/types/parts';
import { costPanel } from '@renderer/lib/bom';
import { downloadBomCsv, downloadBomXlsx } from '@renderer/lib/bomExport';
import { formatAmps, formatPercent } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';

/** Slugify a panel name into a safe download filename stem. */
function fileStem(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'panel';
}

/** Cable make-up text for a circuit: prefer the explicit spec, else size × cores. */
function cableMakeUp(circuit: CircuitResult): string {
  const g = circuit.grounding;
  if (g.cableSpec) return g.cableSpec;
  return `${circuit.cable.csaMm2} mm² · ${g.cores}-core`;
}

/**
 * The per-circuit cable schedule — the tabular document panel builders expect.
 * One row per computed circuit, plus an "Export BOM" control that prices the
 * panel BOM and downloads it as `.csv` or `.xlsx` straight from the renderer.
 */
export function CableSchedule({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);

  // Run lengths live on the input model; match by circuit id so the order of
  // result circuits and input circuits need not agree.
  const lengthById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of panel.circuits) m.set(c.id, c.lengthM);
    return m;
  }, [panel.circuits]);

  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costPanel(result, parts as Part[], priceMap);
  }, [result, parts, prices]);

  function exportCsv() {
    downloadBomCsv(`${fileStem(result.name)}-bom.csv`, cost.lines, cost.currency);
    notifications.show({
      message: t('schedule.exportedCsv', { count: cost.lines.length }),
      color: 'teal',
    });
  }

  function exportXlsx() {
    downloadBomXlsx(`${fileStem(result.name)}-bom.xlsx`, cost.lines, cost.currency);
    notifications.show({
      message: t('schedule.exportedXlsx', { count: cost.lines.length }),
      color: 'teal',
    });
  }

  const bus = result.busbar;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Text fw={600}>{t('schedule.title')}</Text>
        <Button.Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileText size={14} />}
            onClick={exportCsv}
          >
            {t('schedule.exportCsv')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileSpreadsheet size={14} />}
            onClick={exportXlsx}
          >
            {t('schedule.exportXlsx')}
          </Button>
        </Button.Group>
      </Group>

      <Card withBorder radius="md" padding="sm">
        <Table.ScrollContainer minWidth={1120}>
          <Table verticalSpacing="xs" fz="sm" highlightOnHover withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={48}>{t('schedule.colNo')}</Table.Th>
                <Table.Th w={120}>{t('schedule.colFrom')}</Table.Th>
                <Table.Th>{t('schedule.colTo')}</Table.Th>
                <Table.Th w={56}>{t('schedule.colPhase')}</Table.Th>
                <Table.Th w={84}>{t('schedule.colDesignI')}</Table.Th>
                <Table.Th w={150}>{t('schedule.colBreaker')}</Table.Th>
                <Table.Th w={180}>{t('schedule.colCable')}</Table.Th>
                <Table.Th w={110}>{t('schedule.colConduit')}</Table.Th>
                <Table.Th w={88}>{t('schedule.colIzDerated')}</Table.Th>
                <Table.Th w={72}>{t('schedule.colLength')}</Table.Th>
                <Table.Th w={72}>{t('schedule.colVdrop')}</Table.Th>
                <Table.Th w={64}>{t('schedule.colPe')}</Table.Th>
                <Table.Th w={64}>{t('schedule.colNeutral')}</Table.Th>
                <Table.Th w={72}>{t('schedule.colRcd')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.circuits.map((c, i) => {
                const len = lengthById.get(c.circuitId);
                const vd = c.voltageDrop;
                return (
                  <Table.Tr key={c.circuitId}>
                    <Table.Td>{i + 1}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {panel.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {c.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{c.phase}</Table.Td>
                    <Table.Td>{formatAmps(c.designCurrentA)}</Table.Td>
                    <Table.Td>
                      {c.breaker.deviceClass} {c.breaker.ratingA}A · {c.breaker.curve}
                    </Table.Td>
                    <Table.Td>{cableMakeUp(c)}</Table.Td>
                    <Table.Td>
                      {c.containment
                        ? `${c.containment.conduitSizeMm} mm (${c.containment.fillPct}%)`
                        : '—'}
                    </Table.Td>
                    <Table.Td>{formatAmps(c.cable.deratedIzA)}</Table.Td>
                    <Table.Td>{len !== undefined ? `${len} m` : '—'}</Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        c={vd.withinLimit ? undefined : 'red'}
                        fw={vd.withinLimit ? 400 : 700}
                      >
                        {formatPercent(vd.dropPercent)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{c.grounding.peCsaMm2} mm²</Table.Td>
                    <Table.Td>
                      {c.grounding.neutralCsaMm2 > 0 ? `${c.grounding.neutralCsaMm2} mm²` : '—'}
                    </Table.Td>
                    <Table.Td>{c.rcd.required ? `${c.rcd.ratingMa} mA` : '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Box>
        <Text size="xs" c="dimmed">
          {t('schedule.busbarNote', {
            width: bus.widthMm,
            thickness: bus.thicknessMm,
            csa: bus.csaMm2,
            rated: formatAmps(bus.ampacityA),
            current: formatAmps(bus.totalCurrentA),
          })}
        </Text>
        {result.cableTray && (
          <Text size="xs" c="dimmed">
            {t('schedule.trayNote', {
              width: result.cableTray.widthMm,
              count: result.cableTray.cableCount,
              fill: result.cableTray.fillPct,
            })}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {t('schedule.estimateNote')}
        </Text>
      </Box>
    </Stack>
  );
}
