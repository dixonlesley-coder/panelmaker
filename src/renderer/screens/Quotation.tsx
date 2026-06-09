import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCash, IconDownload, IconReceipt2 } from '@tabler/icons-react';
import { computeSystem, computeQuotation } from '@shared/engine';
import { costSystemConsolidated } from '@renderer/lib/bom';
import { formatIdr } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';
import { exportQuotationPdf } from '@renderer/api';

export function Quotation() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const setProjectMeta = useProjectStore((s) => s.setProjectMeta);

  const quotation = project.meta?.quotation ?? {};

  // Consolidated, priced project BOM → quotation (labor + mark-ups).
  const system = useMemo(() => computeSystem(project), [project]);
  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystemConsolidated(system, parts, priceMap);
  }, [system, parts, prices]);
  const quote = useMemo(
    () => computeQuotation({ lines: cost.lines, settings: quotation }),
    [cost.lines, quotation],
  );

  /** Merge a partial quotation-settings patch into the project meta. */
  const patch = (p: Partial<NonNullable<typeof quotation>>) =>
    setProjectMeta({ quotation: { ...quotation, ...p } });

  const onExport = async () => {
    const res = await exportQuotationPdf(project, parts, prices);
    notifications.show({
      message: res.message,
      color: res.ok ? 'teal' : res.reason === 'web' ? 'blue' : 'red',
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('quotation.eyebrow')}
          </Text>
          <Title order={3}>{t('quotation.title')}</Title>
        </div>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={onExport}
        >
          {t('quotation.exportQuotationPdf')}
        </Button>
      </Group>

      <Card withBorder radius="md" padding="md">
        <Group gap="xs" mb="md">
          <IconReceipt2 size={18} color="var(--mantine-color-indigo-6)" />
          <Text fw={600}>{t('quotation.laborMarkups')}</Text>
        </Group>
        <Text size="xs" c="dimmed" mb="md">
          {t('quotation.laborMarkupsHint')}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <NumberInput
            label={t('quotation.laborRate')}
            description={t('quotation.laborRateHint')}
            suffix=" IDR/h"
            min={0}
            step={10000}
            thousandSeparator=","
            value={quotation.laborRatePerHour ?? quote.settings.laborRatePerHour}
            onChange={(v) => typeof v === 'number' && patch({ laborRatePerHour: v })}
          />
          <NumberInput
            label={t('quotation.overhead')}
            description={t('quotation.ofMaterialLabor')}
            suffix=" %"
            min={0}
            max={100}
            step={1}
            value={quotation.overheadPct ?? quote.settings.overheadPct}
            onChange={(v) => typeof v === 'number' && patch({ overheadPct: v })}
          />
          <NumberInput
            label={t('quotation.margin')}
            description={t('quotation.ofLoadedCost')}
            suffix=" %"
            min={0}
            max={100}
            step={1}
            value={quotation.marginPct ?? quote.settings.marginPct}
            onChange={(v) => typeof v === 'number' && patch({ marginPct: v })}
          />
          <NumberInput
            label={t('quotation.contingency')}
            description={t('quotation.ofMaterialLabor')}
            suffix=" %"
            min={0}
            max={100}
            step={1}
            value={quotation.contingencyPct ?? quote.settings.contingencyPct}
            onChange={(v) => typeof v === 'number' && patch({ contingencyPct: v })}
          />
        </SimpleGrid>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('quotation.material')}
          </Text>
          <Text fw={700} size="lg">
            {formatIdr(quote.materialSubtotal)}
          </Text>
          <Text size="xs" c="dimmed">
            {cost.unmatchedCount > 0
              ? t('quotation.unpricedLines', { count: cost.unmatchedCount })
              : t('quotation.allPriced')}
          </Text>
        </Card>
        <Card withBorder radius="md" padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t('quotation.labor')}
          </Text>
          <Text fw={700} size="lg">
            {formatIdr(quote.laborSubtotal)}
          </Text>
          <Text size="xs" c="dimmed">
            {t('quotation.hAssembly', { hours: quote.laborHours })}
          </Text>
        </Card>
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb={2}>
            <ThemeIcon variant="light" color="teal" size="sm">
              <IconCash size={14} />
            </ThemeIcon>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {t('quotation.quotedTotal')}
            </Text>
          </Group>
          <Text fw={700} size="lg" c="teal">
            {formatIdr(quote.grandTotal)}
          </Text>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Text fw={600} mb="sm">
          {t('quotation.priceBreakdown')}
        </Text>
        <Table verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('quotation.costElement')}</Table.Th>
              <Table.Th ta="right">{t('quotation.amount')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {quote.sections.map((s) => (
              <Table.Tr key={s.label}>
                <Table.Td>{s.label}</Table.Td>
                <Table.Td ta="right">{formatIdr(s.amount)}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td fw={700}>{t('quotation.quotedTotal')}</Table.Td>
              <Table.Td ta="right" fw={700}>
                {formatIdr(quote.grandTotal)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>{t('quotation.billOfMaterials')}</Text>
          <Text size="xs" c="dimmed">
            {t('quotation.linesConsolidated', { count: quote.lines.length })}
          </Text>
        </Group>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs" fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('quotation.item')}</Table.Th>
                <Table.Th w={140}>{t('quotation.orderCode')}</Table.Th>
                <Table.Th w={60} ta="right">
                  {t('quotation.qty')}
                </Table.Th>
                <Table.Th w={140} ta="right">
                  {t('quotation.unitPrice')}
                </Table.Th>
                <Table.Th w={150} ta="right">
                  {t('quotation.lineTotal')}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {quote.lines.map((l, i) => (
                <Table.Tr key={`${l.partId ?? l.description}-${i}`}>
                  <Table.Td>{l.description}</Table.Td>
                  <Table.Td>
                    {l.sku ? (
                      <Text size="xs" ff="monospace">
                        {l.sku}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{l.qty}</Table.Td>
                  <Table.Td ta="right">
                    {l.matched && l.unitPrice !== undefined ? formatIdr(l.unitPrice) : '—'}
                  </Table.Td>
                  <Table.Td ta="right">
                    {l.matched && l.lineTotal !== undefined ? (
                      formatIdr(l.lineTotal)
                    ) : (
                      <Badge size="xs" variant="light" color="gray">
                        {t('quotation.noPrice')}
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
