import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconListSearch, IconSearch } from '@tabler/icons-react';
import type { Part } from '@shared/types';
import { matchCatalog } from '@shared/engine/catalogMatch';
import type { CatalogDeviceKind } from '@shared/data/manufacturers/types';
import { formatIdr } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';

/** Device kinds offered by the manufacturer-family finder. */
const FINDER_KINDS: { value: CatalogDeviceKind; label: string }[] = [
  { value: 'mcb', label: 'MCB' },
  { value: 'mccb', label: 'MCCB' },
  { value: 'contactor', label: 'Contactor (AC-3)' },
  { value: 'overload_relay', label: 'Overload relay' },
  { value: 'rccb', label: 'RCCB' },
  { value: 'spd', label: 'SPD' },
];

/**
 * Manufacturer product-family finder: pick a device kind + required rating and
 * see which Schneider / ABB / Chint / LS series covers it. Representative data —
 * exact catalogue numbers and prices must be verified against the datasheet.
 */
function FamilyFinder() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<CatalogDeviceKind>('mcb');
  const [ratingA, setRatingA] = useState<number | string>(32);
  const [minKa, setMinKa] = useState<number | string>('');

  const matches = useMemo(() => {
    if (typeof ratingA !== 'number' || ratingA <= 0) return [];
    return matchCatalog(kind, ratingA, {
      minBreakingKa: typeof minKa === 'number' && minKa > 0 ? minKa : undefined,
    });
  }, [kind, ratingA, minKa]);

  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="xs" mb="xs">
        <IconListSearch size={18} color="var(--mantine-color-indigo-6)" />
        <Text fw={600}>{t('parts.finderTitle')}</Text>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        {t('parts.finderHint')}
      </Text>
      <Group gap="md" align="flex-end" mb="sm" wrap="wrap">
        <Select
          label={t('parts.finderKind')}
          data={FINDER_KINDS}
          value={kind}
          allowDeselect={false}
          onChange={(v) => v && setKind(v as CatalogDeviceKind)}
          w={180}
        />
        <NumberInput
          label={t('parts.finderRating')}
          value={ratingA}
          onChange={setRatingA}
          min={1}
          suffix=" A"
          w={140}
        />
        <NumberInput
          label={t('parts.finderMinKa')}
          value={minKa}
          onChange={setMinKa}
          min={0}
          suffix=" kA"
          w={140}
          placeholder="—"
        />
      </Group>
      {matches.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('parts.finderNoMatch')}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('parts.manufacturer')}</Table.Th>
                <Table.Th>{t('parts.finderSeries')}</Table.Th>
                <Table.Th>{t('parts.finderPick')}</Table.Th>
                <Table.Th>{t('parts.finderBreaking')}</Table.Th>
                <Table.Th>{t('parts.orderCode')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {matches.map((m) => (
                <Table.Tr key={`${m.family.manufacturer}:${m.family.series}`}>
                  <Table.Td>{m.family.manufacturer}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {m.family.series}
                    </Text>
                  </Table.Td>
                  <Table.Td>{m.ratingA} A</Table.Td>
                  <Table.Td>
                    {m.family.breakingKa !== undefined ? `${m.family.breakingKa} kA` : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {m.family.orderCodeHint ?? '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed" mt="xs">
        {t('parts.finderDisclaimer')}
      </Text>
    </Card>
  );
}

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
  const [brand, setBrand] = useState<string | null>(null);

  // Brands actually present in the loaded catalog (covers imported parts too).
  const brands = useMemo(
    () => [...new Set(parts.map((p) => p.manufacturer))].sort((a, b) => a.localeCompare(b)),
    [parts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = brand === null ? parts : parts.filter((p) => p.manufacturer === brand);
    if (!q) return pool;
    return pool.filter((p) => {
      const haystack = [p.manufacturer, p.model, p.category, p.id, skuOf(p) ?? '', summarizeAttributes(p)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [parts, query, brand]);

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
        <Group gap="xs">
          <Select
            placeholder={t('parts.allBrands')}
            aria-label={t('parts.brandFilter')}
            data={brands}
            value={brand}
            clearable
            searchable
            comboboxProps={{ withinPortal: true }}
            onChange={setBrand}
            w={190}
          />
          <TextInput
            placeholder={t('parts.searchPlaceholder')}
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={320}
          />
        </Group>
      </Group>

      <FamilyFinder />

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
