import { useMemo } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconChevronRight,
  IconCpu,
  IconCurrencyDollar,
  IconDownload,
  IconTemperature,
} from '@tabler/icons-react';
import type { CircuitResult, PanelResult, Part, PhaseAssignment } from '@shared/types';
import { Stat } from '@renderer/features/components/Stat';
import { costPanel } from '@renderer/lib/bom';
import { formatAmps, formatIdr, formatKw, formatPercent } from '@renderer/lib/format';
import { useProjectStore } from '@renderer/state/projectStore';
import { exportPanelPdf } from '@renderer/api';

const PHASE_COLOR: Record<PhaseAssignment, string> = {
  L1: 'red',
  L2: 'yellow',
  L3: 'blue',
  '3ph': 'grape',
};

/** Color a voltage-drop cell green/red against its limit. */
function vdColor(within: boolean): string {
  return within ? 'teal' : 'red';
}

/**
 * Compact protection summary: device breaking capacity (red when below the
 * prospective fault) and the earth-fault loop (Zs) disconnection check. Renders
 * a dash when no fault analysis is available (e.g. an isolated panel preview).
 */
function ProtectionCell({ circuit }: { circuit: CircuitResult }) {
  const { breakerKa, kaAdequate, disconnectsInTime, zsOhm, zsMaxOhm } = circuit;
  if (breakerKa === undefined && disconnectsInTime === undefined) {
    return (
      <Text c="dimmed" fz="xs">
        —
      </Text>
    );
  }
  return (
    <Group gap={4} wrap="nowrap">
      {breakerKa !== undefined && (
        <Badge
          size="sm"
          variant={kaAdequate === false ? 'filled' : 'light'}
          color={kaAdequate === false ? 'red' : 'gray'}
          title={
            kaAdequate === false
              ? 'Breaking capacity below the prospective fault'
              : 'Breaking capacity (Icu)'
          }
        >
          {breakerKa} kA
        </Badge>
      )}
      {disconnectsInTime !== undefined && (
        <Badge
          size="sm"
          variant="light"
          color={disconnectsInTime ? 'teal' : 'red'}
          title={
            zsOhm !== undefined && zsMaxOhm !== undefined
              ? `Zs ${zsOhm} / ${zsMaxOhm} Ω max`
              : 'Earth-fault loop disconnection'
          }
        >
          Zs {disconnectsInTime ? '✓' : '✗'}
        </Badge>
      )}
    </Group>
  );
}

/** Expandable control-gear detail shown under motor/pump rows. */
function ControlDetail({ circuit }: { circuit: CircuitResult }) {
  const control = circuit.control;
  if (!control) return null;
  return (
    <Box pl="md" py="xs">
      <Group gap="xs" mb={6}>
        <ThemeIcon size="sm" variant="light" color="grape">
          <IconCpu size={14} />
        </ThemeIcon>
        <Text size="sm" fw={600}>
          {control.starterType.replace('_', '-')} control assembly
        </Text>
        {control.motor && (
          <Text size="xs" c="dimmed">
            {control.motor.kw} kW · FLC {formatAmps(control.motor.flcA)} · {control.motor.poles}P
          </Text>
        )}
        {control.pump && (
          <Badge size="xs" variant="light" color="cyan">
            pump: {control.pump.mode} / {control.pump.sensing}
          </Badge>
        )}
      </Group>

      {control.starting && (
        <Text size="xs" c="dimmed" mb={6}>
          <b>Starting</b> ({control.starting.method}): {formatAmps(control.starting.startCurrentA)} inrush (~
          {control.starting.startCurrentMultiple}× FLC), {control.starting.startTorquePct}% torque —{' '}
          {control.starting.note}
        </Text>
      )}

      <Table withTableBorder withColumnBorders verticalSpacing={4} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Role</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Rating / setting</Table.Th>
            <Table.Th w={50}>Qty</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {control.devices.map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td>{d.role}</Table.Td>
              <Table.Td>
                <Text c="dimmed" fz="xs">
                  {d.category}
                </Text>
              </Table.Td>
              <Table.Td>{d.rating ?? (d.targetRatingA ? formatAmps(d.targetRatingA) : '—')}</Table.Td>
              <Table.Td>{d.qty}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {control.interlocks.length > 0 && (
        <Stack gap={2} mt="xs">
          <Text size="xs" fw={600} c="dimmed">
            Interlocks
          </Text>
          {control.interlocks.map((il) => (
            <Text key={il.id} size="xs" c="dimmed">
              · {il.kind} {il.relation.replace('_', ' ')}
              {il.note ? ` — ${il.note}` : ''}
            </Text>
          ))}
        </Stack>
      )}
    </Box>
  );
}

/** A single results row; motor/pump rows are expandable to reveal gear. */
function ResultRow({ circuit }: { circuit: CircuitResult }) {
  const [open, { toggle }] = useDisclosure(false);
  const hasControl = circuit.control !== undefined;
  const vd = circuit.voltageDrop;

  return (
    <>
      <Table.Tr
        style={{ cursor: hasControl ? 'pointer' : 'default' }}
        onClick={() => hasControl && toggle()}
      >
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            {hasControl && (
              <IconChevronRight
                size={14}
                style={{
                  transform: open ? 'rotate(90deg)' : 'none',
                  transition: 'transform 120ms ease',
                }}
              />
            )}
            <Text size="sm" fw={500}>
              {circuit.name}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>
          <Badge size="sm" variant="light" color={PHASE_COLOR[circuit.phase]}>
            {circuit.phase}
          </Badge>
        </Table.Td>
        <Table.Td>{formatAmps(circuit.designCurrentA)}</Table.Td>
        <Table.Td>
          <Badge variant="light" color="indigo" size="sm">
            {circuit.breaker.deviceClass} {circuit.breaker.ratingA}A · {circuit.breaker.curve}
          </Badge>
        </Table.Td>
        <Table.Td>
          {circuit.cable.csaMm2} mm²
          <Text span c="dimmed" fz="xs">
            {' '}
            (Iz {formatAmps(circuit.cable.deratedIzA)})
          </Text>
          <Text c="dimmed" fz="xs">
            {circuit.grounding.cores}-core · PE {circuit.grounding.peCsaMm2} mm²
          </Text>
          {circuit.rcd.required && (
            <Badge size="xs" variant="light" color="teal" mt={2}>
              RCD {circuit.rcd.ratingMa} mA
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <Text c={vdColor(vd.withinLimit)} fw={vd.withinLimit ? 400 : 700} size="sm">
            {formatPercent(vd.dropPercent)}
          </Text>
        </Table.Td>
        <Table.Td>
          <ProtectionCell circuit={circuit} />
        </Table.Td>
      </Table.Tr>
      {hasControl && (
        <Table.Tr>
          <Table.Td colSpan={7} p={0} style={{ border: open ? undefined : 'none' }}>
            <Collapse in={open}>
              <ControlDetail circuit={circuit} />
            </Collapse>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

/** Per-circuit results plus busbar, enclosure and a BOM cost summary. */
export function ResultsPanel({ result }: { result: PanelResult }) {
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const project = useProjectStore((s) => s.project);

  const cost = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costPanel(result, parts as Part[], priceMap);
  }, [result, parts, prices]);

  const enc = result.enclosure;
  const bus = result.busbar;
  const pb = result.phaseBalance;
  const phaseMax = Math.max(pb.L1, pb.L2, pb.L3, 1);

  async function onExportPdf() {
    const res = await exportPanelPdf(project, result.panelId, result.name);
    notifications.show({
      message: res.message,
      color: res.ok ? 'teal' : res.reason === 'web' ? 'blue' : 'red',
    });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Results</Text>
        <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={onExportPdf}>
          Export panel PDF
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <Stat
          label="Connected load"
          value={formatKw(result.totalConnectedLoadW)}
          icon={<IconBolt size={18} />}
        />
        <Stat
          label="Demand current"
          value={formatAmps(result.totalDemandCurrentA)}
          hint="Σ branch design currents"
          icon={<IconBolt size={18} />}
          color="grape"
        />
        <Stat
          label="Enclosure heat"
          value={`${enc.totalHeatW.toFixed(0)} W`}
          hint={`${enc.ventilation} cooling`}
          icon={<IconTemperature size={18} />}
          color="orange"
        />
        <Stat
          label="Estimated cost"
          value={formatIdr(cost.grandTotal)}
          hint={cost.unmatchedCount > 0 ? `${cost.unmatchedCount} unpriced` : 'all priced'}
          icon={<IconCurrencyDollar size={18} />}
          color="teal"
        />
      </SimpleGrid>

      <Card withBorder radius="md" padding="sm">
        <Text fw={600} size="sm" mb="xs">
          Branch circuits
        </Text>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Circuit</Table.Th>
                <Table.Th w={64}>Phase</Table.Th>
                <Table.Th w={100}>Design I</Table.Th>
                <Table.Th w={150}>Breaker</Table.Th>
                <Table.Th w={170}>Cable / wiring</Table.Th>
                <Table.Th w={80}>Vdrop</Table.Th>
                <Table.Th w={120}>Protection</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.circuits.map((c) => (
                <ResultRow key={c.circuitId} circuit={c} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            Busbar
          </Text>
          <Stack gap={4}>
            <KeyVal k="Section" v={`${bus.widthMm} × ${bus.thicknessMm} mm (${bus.csaMm2} mm²)`} />
            <KeyVal k="Ampacity" v={formatAmps(bus.ampacityA)} />
            <KeyVal k="Total current" v={formatAmps(bus.totalCurrentA)} />
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Text fw={600} size="sm" mb="xs">
            Enclosure
          </Text>
          <Stack gap={4}>
            <KeyVal k="Dimensions" v={`${enc.widthMm} × ${enc.heightMm} × ${enc.depthMm} mm`} />
            <KeyVal k="Sheet" v={`${enc.sheetThicknessMm} mm`} />
            <KeyVal k="Layout" v={`${enc.modules} modules · ${enc.rows} rows`} />
            <KeyVal k="Cooling" v={`${enc.ventilation} · ${enc.totalHeatW.toFixed(0)} W`} />
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600} size="sm">
            Phase balance
          </Text>
          {result.phaseBalance.L2 === 0 && result.phaseBalance.L3 === 0 ? (
            <Badge variant="light" color="gray">
              single-phase
            </Badge>
          ) : (
            <Badge variant="light" color={pb.imbalancePct > 15 ? 'red' : 'teal'}>
              {formatPercent(pb.imbalancePct)} imbalance
            </Badge>
          )}
        </Group>
        <SimpleGrid cols={3} spacing="md">
          {(['L1', 'L2', 'L3'] as const).map((ph) => (
            <div key={ph}>
              <Group justify="space-between" mb={2}>
                <Text size="xs" c="dimmed">
                  {ph}
                </Text>
                <Text size="xs" fw={600}>
                  {formatAmps(pb[ph])}
                </Text>
              </Group>
              <Progress value={(pb[ph] / phaseMax) * 100} color={PHASE_COLOR[ph]} size="sm" />
            </div>
          ))}
        </SimpleGrid>
      </Card>

      <Divider label="Bill of materials" labelPosition="left" />
      <Card withBorder radius="md" padding="sm">
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th w={90}>Category</Table.Th>
              <Table.Th w={60}>Qty</Table.Th>
              <Table.Th w={140} ta="right">
                Line total
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cost.lines.map((line, i) => (
              <Table.Tr key={i}>
                <Table.Td>{line.description}</Table.Td>
                <Table.Td>
                  <Text c="dimmed" fz="xs">
                    {line.category}
                  </Text>
                </Table.Td>
                <Table.Td>{line.qty}</Table.Td>
                <Table.Td ta="right">
                  {line.matched && line.lineTotal !== undefined ? (
                    formatIdr(line.lineTotal)
                  ) : (
                    <Badge size="xs" variant="light" color="gray">
                      unpriced
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text fw={700}>Grand total</Text>
              </Table.Td>
              <Table.Td ta="right">
                <Text fw={700}>{formatIdr(cost.grandTotal)}</Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Card>
    </Stack>
  );
}

/** Small label/value row used inside the busbar and enclosure cards. */
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
