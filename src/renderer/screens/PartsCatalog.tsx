import { useMemo, useState } from 'react';
import { Badge, Card, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { Part } from '@shared/types';
import { formatIdr } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';

/** Render a part's most relevant attributes as a compact summary string. */
function summarizeAttributes(part: Part): string {
  const a = part.attributes;
  const keys = Object.keys(a).slice(0, 4);
  return keys
    .map((k) => `${k}: ${String(a[k])}`)
    .join(' · ');
}

/** Group parts by their category for sectioned display. */
function groupByCategory(parts: Part[]): Map<string, Part[]> {
  const map = new Map<string, Part[]>();
  for (const p of parts) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return map;
}

export function PartsCatalog() {
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) => {
      const haystack = [p.manufacturer, p.model, p.category, p.id, summarizeAttributes(p)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [parts, query]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Catalog
          </Text>
          <Title order={3}>Parts</Title>
        </div>
        <TextInput
          placeholder="Search manufacturer, model, attribute…"
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
        />
      </Group>

      {grouped.size === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No parts match “{query}”.
        </Text>
      )}

      {[...grouped.entries()].map(([category, items]) => (
        <Card key={category} withBorder radius="md" padding="sm">
          <Group mb="xs" gap="xs">
            <Badge variant="light" color="indigo" tt="none">
              {category}
            </Badge>
            <Text size="xs" c="dimmed">
              {items.length} item{items.length === 1 ? '' : 's'}
            </Text>
          </Group>
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={140}>Manufacturer</Table.Th>
                  <Table.Th w={170}>Model</Table.Th>
                  <Table.Th>Attributes</Table.Th>
                  <Table.Th w={150} ta="right">
                    Price
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((part) => {
                  const price = prices[part.id];
                  return (
                    <Table.Tr key={part.id}>
                      <Table.Td>{part.manufacturer}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {part.model}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {summarizeAttributes(part)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {price !== undefined ? (
                          <Text size="sm" fw={500}>
                            {formatIdr(price)}
                          </Text>
                        ) : (
                          <Badge size="xs" variant="light" color="gray">
                            no price
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      ))}
    </Stack>
  );
}
