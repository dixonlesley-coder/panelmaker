import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconFileTypePdf } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { loadCatalog, tablesToCandidates } from '@shared/data/catalog';
import type { CatalogExtractResult } from '@shared/ipc-contract';
import { PART_CATEGORIES } from '@shared/types/parts';
import { useProjectStore } from '@renderer/state/projectStore';
import { extractCatalogPdf } from '@renderer/api';

const PREVIEW_ROWS = 40;

/**
 * Desktop-only: pick a catalogue PDF, extract its ordering tables with the
 * bundled Python extractor, review the detected parts (set the category/series
 * the tables omit), and import the valid ones into the catalogue. Pairs with the
 * Settings export button to push the result to the committed dataset.
 */
export function CatalogPdfImport() {
  const { t } = useTranslation();
  const importParts = useProjectStore((s) => s.importParts);

  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('breaker');
  const [defaultSeries, setDefaultSeries] = useState('');
  const [result, setResult] = useState<CatalogExtractResult | null>(null);

  const candidates = useMemo(() => {
    if (!result?.tables?.length) return [];
    return tablesToCandidates(result.tables, {
      defaultCategory: defaultCategory as never,
      defaultSeries: defaultSeries.trim() || undefined,
    });
  }, [result, defaultCategory, defaultSeries]);

  const validated = useMemo(
    () => loadCatalog({ catalogVersion: 'pdf', manufacturer: 'Schneider Electric', source: 'pdf', parts: candidates }),
    [candidates],
  );

  async function onPickPdf() {
    setLoading(true);
    setResult(null);
    try {
      const res = await extractCatalogPdf(pagesInput.trim() || undefined);
      if (!res || res.canceled) return;
      setResult(res);
      if (res.error) notifications.show({ message: res.error, color: 'red' });
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  }

  function onImport() {
    importParts(validated.parts);
    notifications.show({
      message: t('catalogPdf.imported', { count: validated.parts.length, skipped: validated.issues.length }),
      color: validated.issues.length ? 'yellow' : 'teal',
    });
    setOpened(false);
    setResult(null);
  }

  return (
    <>
      <Button
        variant="light"
        color="grape"
        leftSection={<IconFileTypePdf size={16} />}
        onClick={() => setOpened(true)}
      >
        {t('catalogPdf.button')}
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} size="xl" title={t('catalogPdf.title')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('catalogPdf.hint')}
          </Text>

          <Group align="flex-end" gap="sm">
            <TextInput
              label={t('catalogPdf.pages')}
              placeholder="120-140"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.currentTarget.value)}
              w={140}
            />
            <Button onClick={onPickPdf} loading={loading} leftSection={<IconFileTypePdf size={16} />}>
              {t('catalogPdf.choose')}
            </Button>
          </Group>

          {result && !result.error && (
            <>
              <Group gap="lg">
                <Text size="sm">
                  <b>{result.pdfName}</b>
                  {result.pages ? ` · ${result.pages} ${t('catalogPdf.pagesWord')}` : ''}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('catalogPdf.detected', { tables: result.tables.length, parts: candidates.length })}
                </Text>
              </Group>

              <Group align="flex-end" gap="sm">
                <Select
                  label={t('catalogPdf.defaultCategory')}
                  data={[...PART_CATEGORIES]}
                  value={defaultCategory}
                  onChange={(v) => v && setDefaultCategory(v)}
                  searchable
                  w={220}
                />
                <TextInput
                  label={t('catalogPdf.defaultSeries')}
                  placeholder="Acti9 iC60N"
                  value={defaultSeries}
                  onChange={(e) => setDefaultSeries(e.currentTarget.value)}
                  w={220}
                />
              </Group>

              {candidates.length === 0 ? (
                <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                  {t('catalogPdf.noRows')}
                </Alert>
              ) : (
                <>
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      {t('catalogPdf.preview', { shown: Math.min(PREVIEW_ROWS, validated.parts.length), total: validated.parts.length })}
                    </Text>
                    {validated.issues.length > 0 && (
                      <Badge color="yellow" variant="light">
                        {t('catalogPdf.skipped', { count: validated.issues.length })}
                      </Badge>
                    )}
                  </Group>
                  <ScrollArea.Autosize mah={320}>
                    <Table striped highlightOnHover stickyHeader>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>SKU</Table.Th>
                          <Table.Th>{t('catalogPdf.colCategory')}</Table.Th>
                          <Table.Th>{t('catalogPdf.colModel')}</Table.Th>
                          <Table.Th>A</Table.Th>
                          <Table.Th>P</Table.Th>
                          <Table.Th>{t('catalogPdf.colCurve')}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {validated.parts.slice(0, PREVIEW_ROWS).map((p) => (
                          <Table.Tr key={p.id}>
                            <Table.Td ff="monospace">{p.id}</Table.Td>
                            <Table.Td>{p.category}</Table.Td>
                            <Table.Td>{p.model}</Table.Td>
                            <Table.Td>{String(p.attributes.ratingA ?? '')}</Table.Td>
                            <Table.Td>{String(p.attributes.poles ?? '')}</Table.Td>
                            <Table.Td>{String(p.attributes.curve ?? '')}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea.Autosize>
                </>
              )}
            </>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setOpened(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onImport} disabled={validated.parts.length === 0} color="grape">
              {t('catalogPdf.import', { count: validated.parts.length })}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
