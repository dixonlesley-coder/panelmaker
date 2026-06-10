import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, Box, Group, Paper, Text } from '@mantine/core';
import { IconBolt, IconCpu, IconPlugConnected } from '@tabler/icons-react';

/**
 * Custom React Flow node renderers for the single-line diagrams. Nodes carry a
 * `kind` discriminator in their data so a single component map can render the
 * incomer, busbar, branch and panel shapes.
 */

export interface IncomerNodeData {
  label: string;
  ratingA: string;
  [key: string]: unknown;
}

export interface BusbarNodeData {
  label: string;
  ampacity: string;
  [key: string]: unknown;
}

export interface BranchNodeData {
  name: string;
  breaker: string;
  cable: string;
  starter?: string;
  warn?: boolean;
  /** Human notes of what the last edit re-sized here (builder change marking). */
  changed?: string[];
  [key: string]: unknown;
}

export interface PanelNodeData {
  name: string;
  tag?: string;
  loadKw: string;
  incomerA: string;
  source: 'utility' | 'feeder';
  warn?: boolean;
  [key: string]: unknown;
}

/** Incomer: the panel's main breaker / supply point. */
export function IncomerNode({ data }: NodeProps) {
  const d = data as IncomerNodeData;
  return (
    <Paper withBorder radius="md" p="xs" shadow="sm" style={{ width: 180 }}>
      <Group gap={6} wrap="nowrap">
        <IconPlugConnected size={18} color="var(--mantine-color-indigo-5)" />
        <Box>
          <Text size="sm" fw={700} lineClamp={1}>
            {d.label}
          </Text>
          <Text size="xs" c="dimmed">
            Incomer · {d.ratingA}
          </Text>
        </Box>
      </Group>
      <Handle type="source" position={Position.Bottom} />
    </Paper>
  );
}

/** Busbar: a wide bar all branches hang off. */
export function BusbarNode({ data }: NodeProps) {
  const d = data as BusbarNodeData;
  return (
    <Box
      style={{
        width: 620,
        background: 'var(--mantine-color-indigo-6)',
        color: 'white',
        borderRadius: 4,
        padding: '4px 10px',
      }}
    >
      <Group justify="space-between">
        <Text size="xs" fw={700}>
          {d.label}
        </Text>
        <Text size="xs">{d.ampacity}</Text>
      </Group>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}

/** Branch: one outgoing circuit with breaker + cable + optional starter. */
export function BranchNode({ data }: NodeProps) {
  const d = data as BranchNodeData;
  const changed = d.changed && d.changed.length > 0;
  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      shadow={changed ? 'md' : 'xs'}
      style={{
        width: 160,
        borderColor: d.warn
          ? 'var(--mantine-color-red-5)'
          : changed
            ? 'var(--mantine-color-teal-5)'
            : undefined,
        borderWidth: changed ? 2 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Group justify="space-between" wrap="nowrap" gap={4} mb={4}>
        <Text size="xs" fw={600} lineClamp={2} title={d.name} style={{ minWidth: 0 }}>
          {d.name}
        </Text>
        {changed && (
          <Badge size="xs" variant="filled" color="teal" title={d.changed!.join('\n')}>
            Δ
          </Badge>
        )}
      </Group>
      <Group gap={4} mb={2}>
        <IconBolt size={12} />
        <Text size="xs" c="dimmed">
          {d.breaker}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {d.cable}
      </Text>
      {d.starter && (
        <Group gap={4} mt={4}>
          <IconCpu size={12} color="var(--mantine-color-grape-5)" />
          <Badge size="xs" variant="light" color="grape">
            {d.starter}
          </Badge>
        </Group>
      )}
      {changed && (
        <Text size="xs" c="teal.7" mt={4} lineClamp={2}>
          {d.changed!.join(' · ')}
        </Text>
      )}
    </Paper>
  );
}

/** Panel: a node in the building-level diagram. */
export function PanelNode({ data }: NodeProps) {
  const d = data as PanelNodeData;
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      shadow="sm"
      style={{
        width: 200,
        cursor: 'pointer',
        borderColor: d.warn ? 'var(--mantine-color-orange-5)' : undefined,
        borderWidth: d.warn ? 2 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Group justify="space-between" mb={4} wrap="nowrap" gap={6}>
        <Box style={{ minWidth: 0 }}>
          {d.tag && (
            <Text size="xs" fw={700} c="indigo.6" ff="monospace" lineClamp={1}>
              {d.tag}
            </Text>
          )}
          <Text size="sm" fw={700} lineClamp={1} title={d.name}>
            {d.name}
          </Text>
        </Box>
        <Badge size="xs" variant="light" color={d.source === 'utility' ? 'indigo' : 'gray'}>
          {d.source}
        </Badge>
      </Group>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Load
        </Text>
        <Text size="xs" fw={600}>
          {d.loadKw}
        </Text>
      </Group>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Incomer
        </Text>
        <Text size="xs" fw={600}>
          {d.incomerA}
        </Text>
      </Group>
      <Handle type="source" position={Position.Bottom} />
    </Paper>
  );
}

/** Node-type map shared by both diagrams. */
export const NODE_TYPES = {
  incomer: IncomerNode,
  busbar: BusbarNode,
  branch: BranchNode,
  panel: PanelNode,
};
