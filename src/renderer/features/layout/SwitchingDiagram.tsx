import { Alert, Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconBulb, IconFileVector } from '@tabler/icons-react';
import type { PanelInput } from '@shared/types/project';
import type { PanelResult } from '@shared/types/results';
import { panelPointsSvg, panelPointsDxf } from '@shared/drawing';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';

/**
 * The lighting & small-power points diagram: per point-modelled circuit, the
 * switch groups (conventional levers / smart modules) and the fixture rows they
 * control, plus socket-outlet chains. Drawn by the shared DOM-free builder
 * `panelPointsSvg` — the same geometry embedded in the PDF and exported to
 * SVG/DXF, so the screen and the deliverables never diverge.
 */
export function SwitchingDiagram({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();

  const hasPoints = panel.circuits.some(
    (c) => (c.fixtures ?? []).length > 0 || (c.sockets ?? []).length > 0,
  );
  if (!hasPoints) {
    return (
      <Alert color="gray" icon={<IconBulb size={18} />} title={t('switching.emptyTitle')}>
        {t('switching.emptyBody')}
      </Alert>
    );
  }

  const svg = panelPointsSvg(panel, result);
  // Let the viewBox drive responsive scaling on screen; exports use the raw SVG.
  const svgResponsive = svg.replace(
    /^<svg /,
    '<svg style="width:100%;height:auto;max-height:560px;display:block" ',
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>{t('switching.title')}</Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadSvg(`${panel.name} - switching`, svg)}
          >
            {t('layout.exportSvg')}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconFileVector size={14} />}
            onClick={() => downloadDxf(`${panel.name} - switching`, panelPointsDxf(panel, result))}
          >
            {t('layout.exportDxf')}
          </Button>
        </Group>
      </Group>
      <Card withBorder radius="md" padding="md">
        <Box dangerouslySetInnerHTML={{ __html: svgResponsive }} />
      </Card>
      <Text size="xs" c="dimmed">
        {t('switching.hint')}
      </Text>
    </Stack>
  );
}
