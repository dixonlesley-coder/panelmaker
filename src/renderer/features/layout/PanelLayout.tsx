import { Alert, Box, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
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
  const enc = result.enclosure;
  const { widthMm, heightMm, depthMm, sheetThicknessMm, modules, rows, ventilation, totalHeatW } = enc;

  // Degenerate enclosure (no sized gear yet): show a friendly placeholder.
  if (widthMm <= 0 || heightMm <= 0 || rows <= 0 || modules <= 0) {
    return (
      <Stack gap="md">
        <Alert color="gray" icon={<IconRuler2 size={18} />} title="No layout yet">
          Add branch circuits to size the enclosure — the general-arrangement elevation appears once the
          engine computes modules and DIN rows.
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
        <Text fw={600}>General arrangement</Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {panel.system} · front elevation
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadSvg(panel.name, gaSvg)}
          >
            Export SVG
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadDxf(panel.name, panelGaDxf(panel, result))}
          >
            Export DXF
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
          aria-label={`Panel front elevation, ${widthMm} by ${heightMm} millimetres`}
          dangerouslySetInnerHTML={{ __html: gaSvgResponsive }}
        />

        <Text size="xs" c="dimmed" mt="xs" ta="center">
          Schematic general arrangement — estimate, verify against PUIL 2011.
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            Enclosure
          </Text>
          <Stack gap={4}>
            <KeyVal k="Overall (W×H×D)" v={`${widthMm} × ${heightMm} × ${depthMm} mm`} />
            <KeyVal k="Sheet thickness" v={`${sheetThicknessMm} mm`} />
            <KeyVal k="DIN rows" v={`${rows}`} />
            <KeyVal k="Modules (18 mm)" v={`${modules}`} />
          </Stack>
        </Card>
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            Thermal / cooling
          </Text>
          <Stack gap={4}>
            <KeyVal k="Internal heat" v={`${totalHeatW.toFixed(0)} W`} />
            <KeyVal k="Ventilation class" v={ventilation} />
            <KeyVal k="Devices drawn" v={`${result.circuits.length}`} />
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
