import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck, IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import * as XLSX from 'xlsx';
import { useProjectStore } from '@renderer/state/projectStore';
import {
  matchToParts,
  parseRows,
  pricesFromMatches,
  type PricelistMatch,
} from '@renderer/lib/pricelist';

const idr = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

/** Import a CSV/Excel pricelist, match parts by model, and apply unit prices. */
export function Pricelist() {
  const { t } = useTranslation();
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const mergePrices = useProjectStore((s) => s.mergePrices);

  const [match, setMatch] = useState<PricelistMatch | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function onFile(file: File | null) {
    setError(undefined);
    setMatch(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const first = wb.SheetNames[0];
      if (!first) {
        setError(t('pricelist.noSheets'));
        return;
      }
      const ws = wb.Sheets[first]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const parsed = parseRows(rows);
      if (parsed.length === 0) {
        setError(t('pricelist.noColumns'));
        return;
      }
      setMatch(matchToParts(parsed, parts));
    } catch (e) {
      setError(t('pricelist.readFailed', { message: (e as Error).message }));
    }
  }

  function apply() {
    if (!match) return;
    mergePrices(pricesFromMatches(match.matched));
    notifications.show({
      message: t('pricelist.appliedToast', { count: match.matched.length }),
      color: 'teal',
      icon: <IconCheck size={16} />,
    });
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('pricelist.eyebrow')}
        </Text>
        <Title order={3}>{t('pricelist.title')}</Title>
        <Text size="sm" c="dimmed">
          {t('pricelist.subtitle')}
        </Text>
      </div>

      <Card withBorder radius="md" padding="md">
        <Group align="flex-end" justify="space-between">
          <FileInput
            label={t('pricelist.pricelistFile')}
            placeholder={t('pricelist.filePlaceholder')}
            accept=".csv,.xlsx,.xls"
            leftSection={<IconFileSpreadsheet size={16} />}
            clearable
            onChange={onFile}
            w={340}
          />
          <Text size="xs" c="dimmed">
            {t('pricelist.partsPriced', { count: Object.keys(prices).length })}
          </Text>
        </Group>
        {error && (
          <Alert color="red" mt="sm" title={t('pricelist.importError')}>
            {error}
          </Alert>
        )}
      </Card>

      {match && (
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <Badge color="teal" variant="light">
                {t('pricelist.matched', { count: match.matched.length })}
              </Badge>
              <Badge color="gray" variant="light">
                {t('pricelist.unmatched', { count: match.unmatched.length })}
              </Badge>
              {fileName && (
                <Text size="xs" c="dimmed">
                  {fileName}
                </Text>
              )}
            </Group>
            <Button
              leftSection={<IconUpload size={16} />}
              disabled={match.matched.length === 0}
              onClick={apply}
            >
              {t('pricelist.applyPrices', { count: match.matched.length })}
            </Button>
          </Group>

          <ScrollArea h={360}>
            <Table stickyHeader striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('pricelist.manufacturer')}</Table.Th>
                  <Table.Th>{t('pricelist.model')}</Table.Th>
                  <Table.Th ta="right">{t('pricelist.unitPrice')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {match.matched.map((m) => (
                  <Table.Tr key={m.partId}>
                    <Table.Td>{m.manufacturer}</Table.Td>
                    <Table.Td>{m.model}</Table.Td>
                    <Table.Td ta="right">{idr(m.price)}</Table.Td>
                  </Table.Tr>
                ))}
                {match.unmatched.map((u, i) => (
                  <Table.Tr key={`u${i}`}>
                    <Table.Td colSpan={2}>
                      <Text size="xs" c="dimmed">
                        {t('pricelist.noCatalogMatch', { key: u.key })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="xs" c="dimmed">
                        {idr(u.price)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}
    </Stack>
  );
}
