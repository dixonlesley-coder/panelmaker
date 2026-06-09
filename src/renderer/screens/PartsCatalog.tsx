import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { Part } from '@shared/types';
import { formatIdr } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';

/** The order code / SKU of a part, when it carries one. */
function skuOf(part: Part): string | undefined {
  const sku = part.attributes.sku;
  return typeof sku === 'string' && sku.length > 0 ? sku : undefined;
}

/**
 * Render a part's most relevant attributes as a compact summary string. The SKU
 * is shown in its own column, so it is excluded here to avoid duplication.
 */
function summarizeAttributes(part: Part): string {
  const a = part.attributes;
  const keys = Object.keys(a)
    .filter((k) => k !== 'sku')
    .slice(0, 4);
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
  const { t } = useTranslation();
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) => {
      const haystack = [p.manufacturer, p.model, p.category, p.id, skuOf(p) ?? '', summarizeAttributes(p)]
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
            {t('parts.eyebrow')}
          </Text>
          <Title order={3}>{t('parts.title')}</Title>
        </div>
        <TextInput
          placeholder={t('parts.searchPlaceholder')}
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
        />
      </Group>

      {grouped.size === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {t('parts.noMatch', { query })}
        </Text>
      )}

      {[...grouped.entries()].map(([category, items]) => (
        <Card key={category} withBorder radius="md" padding="sm">
          <Group mb="xs" gap="xs">
            <Badge variant="light" color="indigo" tt="none">
              {category}
            </Badge>
            <Text size="xs" c="dimmed">
              {t('parts.items', { count: items.length })}
            </Text>
          </Group>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={140}>{t('parts.manufacturer')}</Table.Th>
                  <Table.Th w={170}>{t('parts.model')}</Table.Th>
                  <Table.Th w={150}>{t('parts.orderCode')}</Table.Th>
                  <Table.Th>{t('parts.attributes')}</Table.Th>
                  <Table.Th w={150} ta="right">
                    {t('parts.price')}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((part) => {
                  const price = prices[part.id];
                  const sku = skuOf(part);
                  return (
                    <Table.Tr key={part.id}>
                      <Table.Td>{part.manufacturer}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {part.model}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {sku ? (
                          <Text size="xs" ff="monospace">
                            {sku}
                          </Text>
                        ) : (
                          <Text size="xs" c="dimmed">
                            —
                          </Text>
                        )}
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
                            {t('parts.noPrice')}
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
