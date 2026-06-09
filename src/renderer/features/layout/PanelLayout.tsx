import { Alert, Box, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconFileVector, IconRuler2 } from '@tabler/icons-react';
import type { PanelInput } from '@shared/types/project';
import type { PanelResult } from '@shared/types/results';
import { panelGaSvg, panelGaDxf } from '@shared/drawing';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';

/** Small labelled key/value used in the dimension legend. */
function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={500} ta="right">
        {v}
      </Text>
    </Group>
  );
}

/**
 * A to-scale general-arrangement front elevation of the panel. The drawing itself
 * comes from the shared, DOM-free builder `panelGaSvg` (the single source of truth
 * shared with the PDF embed and the SVG/DXF exports), so the on-screen view shows
 * the same to-scale device placement: the outer cabinet, the door gutter, the DIN
 * rails with each branch breaker laid on as a to-scale footprint, and the busbar
 * chamber. The surrounding legend cards summarise the enclosure and thermal spec.
 */
export function PanelLayout({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();
  const enc = result.enclosure;
  const { widthMm, heightMm, depthMm, sheetThicknessMm, modules, rows, ventilation, totalHeatW } = enc;

  // Degenerate enclosure (no sized gear yet): show a friendly placeholder.
  if (widthMm <= 0 || heightMm <= 0 || rows <= 0 || modules <= 0) {
    return (
      <Stack gap="md">
        <Alert color="gray" icon={<IconRuler2 size={18} />} title={t('layout.noLayoutTitle')}>
          {t('layout.noLayoutBody')}
        </Alert>
      </Stack>
    );
  }

  // The shared builder renders the to-scale GA (device placement included). We
  // inject its SVG string directly so the screen and the exports never diverge.
  const gaSvg = panelGaSvg(panel, result);
  // The builder emits explicit pixel width/height (needed by pdfmake); for the
  // responsive on-screen embed we let the viewBox drive scaling instead, so the
  // drawing fills the card width. The export buttons use the unmodified `gaSvg`.
  const gaSvgResponsive = gaSvg.replace(
    /^<svg /,
    '<svg style="width:100%;height:auto;max-height:480px;display:block" ',
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>{t('layout.generalArrangement')}</Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {t('layout.frontElevation', { system: panel.system })}
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadSvg(panel.name, gaSvg)}
          >
            {t('layout.exportSvg')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadDxf(panel.name, panelGaDxf(panel, result))}
          >
            {t('layout.exportDxf')}
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" padding="md">
        {/*
          The builder emits a self-contained <svg> with width/height + viewBox; the
          wrapper constrains it to the card width and a sensible max height while the
          viewBox preserves the to-scale aspect ratio.
        */}
        <Box
          style={{ width: '100%' }}
          aria-label={t('layout.frontElevationAria', { width: widthMm, height: heightMm })}
          dangerouslySetInnerHTML={{ __html: gaSvgResponsive }}
        />

        <Text size="xs" c="dimmed" mt="xs" ta="center">
          {t('layout.schematicEstimate')}
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            {t('layout.enclosure')}
          </Text>
          <Stack gap={4}>
            <KeyVal k={t('layout.overall')} v={`${widthMm} × ${heightMm} × ${depthMm} mm`} />
            <KeyVal k={t('layout.sheetThickness')} v={`${sheetThicknessMm} mm`} />
            <KeyVal k={t('layout.dinRows')} v={`${rows}`} />
            <KeyVal k={t('layout.modules18')} v={`${modules}`} />
          </Stack>
        </Card>
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            {t('layout.thermalCooling')}
          </Text>
          <Stack gap={4}>
            <KeyVal k={t('layout.internalHeat')} v={`${totalHeatW.toFixed(0)} W`} />
            <KeyVal k={t('layout.ventilationClass')} v={ventilation} />
            <KeyVal k={t('layout.devicesDrawn')} v={`${result.circuits.length}`} />
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
