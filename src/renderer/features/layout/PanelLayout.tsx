import { Alert, Badge, Box, Button, Card, Group, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconFileVector, IconRefresh, IconRuler2 } from '@tabler/icons-react';
import type { PanelInput } from '@shared/types/project';
import type { PanelResult } from '@shared/types/results';
import { panelGaSvg, panelGaDxf } from '@shared/drawing';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';
import { useProjectStore } from '@renderer/state/projectStore';

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
  const updatePanel = useProjectStore((s) => s.updatePanel);
  const enc = result.enclosure;
  const { widthMm, heightMm, depthMm, sheetThicknessMm, modules, rows, ventilation, totalHeatW } = enc;

  // Manual enclosure override: leave a field blank for auto (placeholder shows the
  // computed value); type a value to size the box to the room. Setting the width
  // or rows re-flows the gear across more DIN rows instead of one wide board.
  const ov = panel.enclosure ?? {};
  const isManual = Object.keys(ov).length > 0;
  const patchEnc = (field: 'widthMm' | 'heightMm' | 'depthMm' | 'rows', v: number | undefined) => {
    const next = { ...ov };
    if (typeof v === 'number' && v > 0) next[field] = field === 'rows' ? Math.round(v) : v;
    else delete next[field];
    updatePanel(panel.id, { enclosure: Object.keys(next).length ? next : undefined });
  };

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

      {enc.fitsModules === false && (
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} title={t('layout.tooSmallTitle')}>
          {t('layout.tooSmallBody', { modules })}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <Text fw={600} size="sm">
                {t('layout.enclosure')}
              </Text>
              {isManual && (
                <Badge size="xs" variant="light" color="indigo">
                  {t('layout.custom')}
                </Badge>
              )}
            </Group>
            {isManual && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconRefresh size={13} />}
                onClick={() => updatePanel(panel.id, { enclosure: undefined })}
              >
                {t('layout.resetAuto')}
              </Button>
            )}
          </Group>
          {/* Editable to suit the room — blank = auto (placeholder shows the
              computed value); a value overrides and re-flows the gear. */}
          <SimpleGrid cols={2} spacing="xs">
            <NumberInput
              label={t('layout.width')}
              hideControls
              suffix=" mm"
              min={100}
              step={50}
              value={ov.widthMm ?? ''}
              placeholder={`${widthMm}`}
              onChange={(v) => patchEnc('widthMm', typeof v === 'number' ? v : undefined)}
            />
            <NumberInput
              label={t('layout.height')}
              hideControls
              suffix=" mm"
              min={100}
              step={50}
              value={ov.heightMm ?? ''}
              placeholder={`${heightMm}`}
              onChange={(v) => patchEnc('heightMm', typeof v === 'number' ? v : undefined)}
            />
            <NumberInput
              label={t('layout.depth')}
              hideControls
              suffix=" mm"
              min={80}
              step={50}
              value={ov.depthMm ?? ''}
              placeholder={`${depthMm}`}
              onChange={(v) => patchEnc('depthMm', typeof v === 'number' ? v : undefined)}
            />
            <NumberInput
              label={t('layout.dinRows')}
              hideControls
              min={1}
              max={12}
              value={ov.rows ?? ''}
              placeholder={`${rows}`}
              onChange={(v) => patchEnc('rows', typeof v === 'number' ? v : undefined)}
            />
          </SimpleGrid>
          <Group justify="space-between" mt="xs">
            <Text size="xs" c="dimmed">
              {t('layout.sheetThickness')}: {sheetThicknessMm} mm · {t('layout.modules18')}: {modules}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {t('layout.customHint')}
          </Text>
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
