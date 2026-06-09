import { Alert, Box, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFileVector, IconRuler2 } from '@tabler/icons-react';
import type { PanelInput } from '@shared/types/project';
import type { PanelResult } from '@shared/types/results';
import { panelGaSvg, panelGaDxf } from '@shared/drawing';
import { downloadSvg, downloadDxf } from '@renderer/lib/drawingExport';

/** A single DIN module is 18 mm wide (one "pole" pitch). */
const MODULE_MM = 18;
/** Inner door gutter / mounting margin around the chassis (mm). */
const GUTTER_MM = 40;
/** Height reserved for the busbar chamber at the bottom (mm). */
const BUSBAR_CHAMBER_MM = 90;

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
 * A to-scale (schematic) SVG front elevation of the panel enclosure, derived
 * from the computed enclosure result: the outer cabinet, a door gutter, the DIN
 * rails (one per `rows`) with 18 mm module ticks, and a busbar chamber. It is a
 * representative general-arrangement sketch, not a CAD drawing.
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

  // --- Geometry in millimetres (SVG user units = mm; scaling is done by viewBox). ---
  const innerW = Math.max(widthMm - 2 * GUTTER_MM, MODULE_MM);
  const railTopY = GUTTER_MM;
  const railBottomY = heightMm - BUSBAR_CHAMBER_MM - GUTTER_MM;
  const railSpan = Math.max(railBottomY - railTopY, MODULE_MM);
  const railPitch = rows > 1 ? railSpan / (rows - 1) : 0;

  // Modules spread across the available rows; ticks per rail = ceil(modules/rows),
  // capped to what physically fits on the rail width.
  const fitPerRail = Math.max(Math.floor(innerW / MODULE_MM), 1);
  const perRail = Math.min(Math.ceil(modules / rows), fitPerRail);

  // Busbar chamber band.
  const chamberY = heightMm - BUSBAR_CHAMBER_MM - GUTTER_MM / 2;
  const chamberH = BUSBAR_CHAMBER_MM;

  const stroke = 'var(--mantine-color-default-border)';
  const accent = 'var(--mantine-color-blue-filled)';
  const dim = 'var(--mantine-color-dimmed)';

  const railIndices = Array.from({ length: rows }, (_, i) => i);
  const moduleIndices = Array.from({ length: perRail }, (_, i) => i);

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
            onClick={() => downloadSvg(panel.name, panelGaSvg(panel, result))}
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
        <Box style={{ width: '100%' }}>
          <svg
            viewBox={`-20 -20 ${widthMm + 40} ${heightMm + 40}`}
            width="100%"
            style={{ maxHeight: 480, display: 'block', color: 'var(--mantine-color-text)' }}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Panel front elevation, ${widthMm} by ${heightMm} millimetres`}
          >
            {/* Cabinet body. */}
            <rect
              x={0}
              y={0}
              width={widthMm}
              height={heightMm}
              fill="none"
              stroke={stroke}
              strokeWidth={Math.max(sheetThicknessMm, 1.5)}
              rx={6}
            />
            {/* Door gutter / mounting plate margin. */}
            <rect
              x={GUTTER_MM / 2}
              y={GUTTER_MM / 2}
              width={widthMm - GUTTER_MM}
              height={heightMm - GUTTER_MM}
              fill="none"
              stroke={stroke}
              strokeWidth={0.75}
              strokeDasharray="6 4"
              rx={4}
            />

            {/* DIN rails with module ticks. */}
            {railIndices.map((r) => {
              const y = railTopY + r * railPitch;
              return (
                <g key={r}>
                  <line
                    x1={GUTTER_MM}
                    y1={y}
                    x2={GUTTER_MM + innerW}
                    y2={y}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                  {moduleIndices.map((m) => {
                    const x = GUTTER_MM + m * MODULE_MM;
                    return (
                      <rect
                        key={m}
                        x={x + 1}
                        y={y - 9}
                        width={MODULE_MM - 2}
                        height={18}
                        fill="none"
                        stroke={accent}
                        strokeWidth={1}
                        rx={1.5}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* Busbar chamber. */}
            <rect
              x={GUTTER_MM / 2}
              y={chamberY}
              width={widthMm - GUTTER_MM}
              height={chamberH}
              fill="none"
              stroke={accent}
              strokeWidth={1}
              strokeDasharray="3 3"
              rx={3}
            />
            <text
              x={widthMm / 2}
              y={chamberY + chamberH / 2}
              fill={dim}
              fontSize={Math.max(widthMm / 28, 12)}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              busbar chamber
            </text>

            {/* Overall width dimension line (top). */}
            <text
              x={widthMm / 2}
              y={-6}
              fill={dim}
              fontSize={Math.max(widthMm / 26, 12)}
              textAnchor="middle"
            >
              {widthMm} mm
            </text>
            {/* Overall height dimension (rotated, left). */}
            <text
              x={-6}
              y={heightMm / 2}
              fill={dim}
              fontSize={Math.max(widthMm / 26, 12)}
              textAnchor="middle"
              transform={`rotate(-90 ${-6} ${heightMm / 2})`}
            >
              {heightMm} mm
            </text>
          </svg>
        </Box>

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
            <KeyVal k="Modules per rail (drawn)" v={`${perRail}`} />
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
