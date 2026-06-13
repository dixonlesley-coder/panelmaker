/**
 * Bulk load-list import — the engineer's fast path. Most jobs start from a load
 * schedule the MEP/architect supplies, not 40 hand-dragged cards. This sheet
 * accepts a CSV/XLSX file OR a paste straight from Excel, shows a live preview
 * (panels, circuits, and anything the importer had to assume), and offers a
 * ready-made template so the columns line up the first time.
 *
 * Parsing is the pure, lenient `parseLoadList`; XLSX is converted to CSV in the
 * browser via SheetJS (already bundled for BOM export).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Code,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { IconDownload, IconFileImport, IconUpload } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { parseLoadList } from '@shared/io/loadListImport';
import type { PanelInput } from '@shared/types';
import { downloadCsv } from '@renderer/lib/download';

/** A worked example so the recognised column headers are obvious. */
const TEMPLATE_CSV = [
  'Panel,Circuit,Load (kW),Phase,Length (m),Kind,cos phi,Motor kW,Starter',
  'LP-1,Lighting ground floor,6,1,35,lighting,0.95,,',
  'LP-1,Socket outlets,8,1,30,socket,0.85,,',
  'MCC,Transfer pump,,3,20,pump,0.85,5.5,DOL',
  'MCC,Main pump,,3,25,motor,0.85,37,STAR_DELTA',
].join('\n');

interface Parsed {
  panels: PanelInput[];
  warnings: string[];
  circuitCount: number;
}

export function LoadImportModal({
  opened,
  onClose,
  onImport,
}: {
  opened: boolean;
  onClose: () => void;
  onImport: (panels: PanelInput[]) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  const parsed = useMemo<Parsed | null>(() => {
    if (!text.trim()) return null;
    const { panels, warnings } = parseLoadList(text);
    return { panels, warnings, circuitCount: panels.reduce((n, p) => n + p.circuits.length, 0) };
  }, [text]);

  /** Read a dropped/picked file; XLSX is flattened to CSV before parsing. */
  function loadFile(file: File) {
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel) {
      void file.arrayBuffer().then((buf) => {
        const wb = XLSX.read(buf, { type: 'array' });
        const first = wb.SheetNames[0];
        const sheet = first ? wb.Sheets[first] : undefined;
        setText(sheet ? XLSX.utils.sheet_to_csv(sheet) : '');
      });
    } else {
      void file.text().then(setText);
    }
  }

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls,text/csv';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) loadFile(f);
    });
    input.click();
  }

  function confirm() {
    if (!parsed || parsed.panels.length === 0) return;
    onImport(parsed.panels);
    setText('');
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={t('loadImport.title')}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('loadImport.intro')}
        </Text>

        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconUpload size={14} />}
            onClick={pickFile}
          >
            {t('loadImport.chooseFile')}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconDownload size={14} />}
            onClick={() => downloadCsv('load-list-template.csv', TEMPLATE_CSV)}
          >
            {t('loadImport.template')}
          </Button>
        </Group>

        <Textarea
          label={t('loadImport.paste')}
          description={t('loadImport.pasteHint')}
          placeholder={TEMPLATE_CSV}
          autosize
          minRows={4}
          maxRows={10}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 } }}
        />

        {parsed && (
          <>
            <Divider label={t('loadImport.preview')} labelPosition="left" />
            {parsed.panels.length === 0 ? (
              <Alert color="red" variant="light">
                {t('loadImport.empty')}
              </Alert>
            ) : (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  {t('loadImport.summary', {
                    panels: parsed.panels.length,
                    circuits: parsed.circuitCount,
                  })}
                </Text>
                <ScrollArea.Autosize mah={180}>
                  <Table fz="xs" striped withRowBorders={false}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('loadImport.colPanel')}</Table.Th>
                        <Table.Th>{t('loadImport.colCircuit')}</Table.Th>
                        <Table.Th>{t('loadImport.colKind')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {parsed.panels.flatMap((p) =>
                        p.circuits.map((c) => (
                          <Table.Tr key={`${p.id}-${c.id}`}>
                            <Table.Td>{p.tag ?? p.name}</Table.Td>
                            <Table.Td>{c.name}</Table.Td>
                            <Table.Td>
                              <Code>{c.loadKind}</Code>
                            </Table.Td>
                          </Table.Tr>
                        )),
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
                {parsed.warnings.length > 0 && (
                  <Alert color="yellow" variant="light" title={t('loadImport.assumptions')}>
                    <Stack gap={2}>
                      {parsed.warnings.slice(0, 6).map((w, i) => (
                        <Text key={i} size="xs">
                          {w}
                        </Text>
                      ))}
                      {parsed.warnings.length > 6 && (
                        <Text size="xs" c="dimmed">
                          {t('loadImport.moreWarnings', { count: parsed.warnings.length - 6 })}
                        </Text>
                      )}
                    </Stack>
                  </Alert>
                )}
              </Stack>
            )}
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            leftSection={<IconFileImport size={16} />}
            disabled={!parsed || parsed.panels.length === 0}
            onClick={confirm}
          >
            {t('loadImport.import')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
