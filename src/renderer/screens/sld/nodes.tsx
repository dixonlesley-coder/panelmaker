import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, Box, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconBattery2, IconBolt, IconCpu, IconPlugConnected, IconSolarPanel } from '@tabler/icons-react';

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
  /** Cable loading: design current as a percent of the cable's derated Iz. */
  utilPct?: number;
  starter?: string;
  warn?: boolean;
  /** Human notes of what the last edit re-sized here (builder change marking). */
  changed?: string[];
  /** True when the breaker rating is a manual user override (violet). */
  breakerOverridden?: boolean;
  /** True when a manual cable minimum is pinned (violet). */
  cableOverridden?: boolean;
  /** Builder only: receive a dropped override card targeted at this circuit. */
  onDropOverride?: (kind: 'breaker' | 'cable', value: number) => void;
  [key: string]: unknown;
}

/** MIME for override cards dragged from the builder palette onto a node. */
export const OVERRIDE_MIME = 'application/x-panelmaker-override';

/** Color a cable-utilisation figure: calm under 80%, warm 80–100%, hot ≥100%. */
function utilColor(pct: number): string {
  if (pct >= 100) return 'red.6';
  if (pct >= 80) return 'orange.6';
  return 'dimmed';
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
    <Paper withBorder radius="md" p="xs" shadow="sm" style={{ width: 180, cursor: 'pointer' }}>
      <Handle type="target" position={Position.Top} />
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
  const overridden = d.breakerOverridden || d.cableOverridden;
  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      shadow={changed ? 'md' : 'xs'}
      onDragOver={
        d.onDropOverride
          ? (e) => {
              if (e.dataTransfer.types.includes(OVERRIDE_MIME)) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
              }
            }
          : undefined
      }
      onDrop={
        d.onDropOverride
          ? (e) => {
              const raw = e.dataTransfer.getData(OVERRIDE_MIME);
              if (!raw) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                const { kind, value } = JSON.parse(raw) as { kind: 'breaker' | 'cable'; value: number };
                if ((kind === 'breaker' || kind === 'cable') && Number.isFinite(value)) {
                  d.onDropOverride!(kind, value);
                }
              } catch {
                /* malformed payload — ignore */
              }
            }
          : undefined
      }
      style={{
        width: 160,
        borderColor: d.warn
          ? 'var(--mantine-color-red-5)'
          : changed
            ? 'var(--mantine-color-teal-5)'
            : overridden
              ? 'var(--mantine-color-violet-5)'
              : undefined,
        borderWidth: changed || overridden ? 2 : undefined,
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
        <IconBolt size={12} color={d.breakerOverridden ? 'var(--mantine-color-violet-6)' : undefined} />
        <Text size="xs" c={d.breakerOverridden ? 'violet.6' : 'dimmed'} fw={d.breakerOverridden ? 600 : undefined}>
          {d.breaker}
        </Text>
        {d.breakerOverridden && (
          <Badge size="xs" variant="light" color="violet">
            manual
          </Badge>
        )}
      </Group>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c={d.cableOverridden ? 'violet.6' : 'dimmed'} fw={d.cableOverridden ? 600 : undefined}>
          {d.cable}
        </Text>
        {d.cableOverridden && (
          <Badge size="xs" variant="light" color="violet">
            manual
          </Badge>
        )}
        {d.utilPct !== undefined && (
          <Text size="xs" c={utilColor(d.utilPct)} title="Cable loading (design current / Iz)">
            · {d.utilPct}% Iz
          </Text>
        )}
      </Group>
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

/** A distributed energy source (solar / battery / generator) tied to the supply. */
export interface SourceNodeData {
  kind: 'solar' | 'battery' | 'generator';
  title: string;
  lines: string[];
  [key: string]: unknown;
}

const SOURCE_ICON = {
  solar: <IconSolarPanel size={16} />,
  battery: <IconBattery2 size={16} />,
  generator: <IconBolt size={16} />,
};
const SOURCE_COLOR = { solar: 'yellow', battery: 'teal', generator: 'orange' } as const;

export function SourceNode({ data }: NodeProps) {
  const d = data as SourceNodeData;
  const color = SOURCE_COLOR[d.kind];
  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      shadow="xs"
      style={{ width: 150, cursor: 'pointer', borderColor: `var(--mantine-color-${color}-5)` }}
    >
      <Group gap={6} wrap="nowrap" mb={2}>
        <ThemeIcon size="sm" variant="light" color={color}>
          {SOURCE_ICON[d.kind]}
        </ThemeIcon>
        <Text size="xs" fw={700} lineClamp={1}>
          {d.title}
        </Text>
      </Group>
      {d.lines.map((l, i) => (
        <Text key={i} size="xs" c="dimmed" lineClamp={1}>
          {l}
        </Text>
      ))}
      <Handle type="source" position={Position.Bottom} />
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
  source: SourceNode,
};
