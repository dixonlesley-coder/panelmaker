import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Text } from '@mantine/core';
import type { SchematicSymbolType } from '@shared/types';
import { LadderSymbol } from './LadderSymbol';

/* Node data shapes (React Flow requires an index signature on node data). */

export interface SymbolNodeData {
  symType: SchematicSymbolType;
  label?: string;
  selected?: boolean;
  [key: string]: unknown;
}
export interface RungBgData {
  width: number;
  height: number;
  label: string;
  generated: boolean;
  locked: boolean;
  selected?: boolean;
  [key: string]: unknown;
}
export interface RailData {
  height: number;
  [key: string]: unknown;
}

/** A ladder element (contact/coil/lamp/...), wired left→right. */
export function SymbolNode({ data }: NodeProps) {
  const d = data as SymbolNodeData;
  return (
    <Box style={{ width: 60, height: 34, position: 'relative' }}>
      {d.label && (
        <Text
          size="9px"
          fw={600}
          c={d.selected ? 'indigo' : 'dimmed'}
          style={{ position: 'absolute', top: -15, left: 0, width: 60, textAlign: 'center', whiteSpace: 'nowrap' }}
        >
          {d.label}
        </Text>
      )}
      <Box
        style={{
          outline: d.selected ? '2px solid var(--mantine-color-indigo-5)' : 'none',
          outlineOffset: 2,
          borderRadius: 4,
        }}
      >
        <LadderSymbol type={d.symType} />
      </Box>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </Box>
  );
}

/** A small junction dot where a rung meets a power rail. */
export function RailTapNode() {
  return (
    <Box
      style={{
        width: 10,
        height: 10,
        borderRadius: 10,
        background: 'var(--mantine-color-indigo-6)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </Box>
  );
}

/** A vertical power rail (decorative; not wired). */
export function RailNode({ data }: NodeProps) {
  const d = data as RailData;
  return <Box style={{ width: 4, height: d.height, background: 'var(--mantine-color-indigo-6)', borderRadius: 2 }} />;
}

/** The tinted band behind a rung, carrying its label + lock/manual state. */
export function RungBgNode({ data }: NodeProps) {
  const d = data as RungBgData;
  const bg = d.generated
    ? 'var(--mantine-color-indigo-light)'
    : 'var(--mantine-color-teal-light)';
  return (
    <Box
      style={{
        width: d.width,
        height: d.height,
        background: bg,
        opacity: d.selected ? 0.9 : 0.5,
        border: d.selected ? '1.5px solid var(--mantine-color-indigo-5)' : '1px solid transparent',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <Text size="10px" fw={600} c="dimmed" style={{ position: 'absolute', top: 4, left: 8 }}>
        {d.label} {d.generated ? '· auto' : '· manual'}
        {d.locked ? ' 🔒' : ''}
      </Text>
    </Box>
  );
}

export const SCHEMATIC_NODE_TYPES = {
  symbol: SymbolNode,
  railtap: RailTapNode,
  rail: RailNode,
  rungbg: RungBgNode,
};
