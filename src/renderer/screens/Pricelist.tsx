import { useState } from 'react';
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
        setError('No sheets found in the file.');
        return;
      }
      const ws = wb.Sheets[first]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const parsed = parseRows(rows);
      if (parsed.length === 0) {
        setError(
          'Could not find a model column and a price column. Expected one column of part models and one of unit prices.',
        );
        return;
      }
      setMatch(matchToParts(parsed, parts));
    } catch (e) {
      setError(`Failed to read file: ${(e as Error).message}`);
    }
  }

  function apply() {
    if (!match) return;
    mergePrices(pricesFromMatches(match.matched));
    notifications.show({
      message: `Applied ${match.matched.length} unit prices to the catalog.`,
      color: 'teal',
      icon: <IconCheck size={16} />,
    });
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Costing
        </Text>
        <Title order={3}>Pricelist import</Title>
        <Text size="sm" c="dimmed">
          Import a CSV or Excel pricelist — a column of part models and a column of unit prices.
          Matched parts update the build cost across every panel and the whole-system total.
        </Text>
      </div>

      <Card withBorder radius="md" padding="md">
        <Group align="flex-end" justify="space-between">
          <FileInput
            label="Pricelist file"
            placeholder="Choose .csv / .xlsx / .xls"
            accept=".csv,.xlsx,.xls"
            leftSection={<IconFileSpreadsheet size={16} />}
            clearable
            onChange={onFile}
            w={340}
          />
          <Text size="xs" c="dimmed">
            {Object.keys(prices).length} parts currently priced
          </Text>
        </Group>
        {error && (
          <Alert color="red" mt="sm" title="Import error">
            {error}
          </Alert>
        )}
      </Card>

      {match && (
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <Badge color="teal" variant="light">
                {match.matched.length} matched
              </Badge>
              <Badge color="gray" variant="light">
                {match.unmatched.length} unmatched
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
              Apply {match.matched.length} prices
            </Button>
          </Group>

          <ScrollArea h={360}>
            <Table stickyHeader striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Manufacturer</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th ta="right">Unit price</Table.Th>
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
                        {u.key} — no catalog match
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
