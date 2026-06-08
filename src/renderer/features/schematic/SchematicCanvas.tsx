import { useMemo } from 'react';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Box } from '@mantine/core';
import type { ControlSchematic } from '@shared/types';
import { SCHEMATIC_NODE_TYPES } from './nodes';

const TOP = 16;
const ROW_H = 96;
const LEFT_X = 30;
const COL0 = 96;
const COL_W = 84;
const BRANCH_DY = 42;
const WIRE_OFFSET = 28; // wire centre within a rung row
const SYM_HALF = 17; // half the symbol node height

interface CanvasProps {
  schematic: ControlSchematic;
  selectedRungId?: string;
  selectedSymbolId?: string;
  onSelectRung: (rungId: string) => void;
  onSelectSymbol: (symbolId: string) => void;
}

function buildLadder(
  schematic: ControlSchematic,
  selectedRungId?: string,
  selectedSymbolId?: string,
): { nodes: Node[]; edges: Edge[]; height: number } {
  const rungs = [...schematic.rungs].sort((a, b) => a.order - b.order);
  const maxCol = schematic.symbols.reduce((m, s) => Math.max(m, s.col), 0);
  const rightX = COL0 + (maxCol + 1) * COL_W;
  const bgWidth = rightX - LEFT_X + 60;
  const height = rungs.length * ROW_H + TOP * 2;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // decorative vertical rails
  nodes.push(
    { id: 'rail-left', type: 'rail', position: { x: LEFT_X + 3, y: TOP }, data: { height: rungs.length * ROW_H }, draggable: false, selectable: false },
    { id: 'rail-right', type: 'rail', position: { x: rightX + 3, y: TOP }, data: { height: rungs.length * ROW_H }, draggable: false, selectable: false },
  );

  rungs.forEach((rung, i) => {
    const rungSymbols = schematic.symbols.filter((s) => s.rungId === rung.id);
    const wireY = TOP + i * ROW_H + WIRE_OFFSET;
    const maxBranch = rungSymbols.reduce((m, s) => Math.max(m, s.branch), 0);

    // rung background band (click to select)
    nodes.push({
      id: `bg-${rung.id}`,
      type: 'rungbg',
      position: { x: LEFT_X - 14, y: TOP + i * ROW_H + 4 },
      data: {
        width: bgWidth,
        height: (maxBranch + 1) * BRANCH_DY + 30,
        label: rung.label ?? `Rung ${i + 1}`,
        generated: rung.generated,
        locked: rung.locked,
        selected: rung.id === selectedRungId,
      },
      draggable: false,
      selectable: false,
    });

    // rail taps
    nodes.push(
      { id: `tapL-${rung.id}`, type: 'railtap', position: { x: LEFT_X, y: wireY - 5 }, data: {}, draggable: false, selectable: false },
      { id: `tapR-${rung.id}`, type: 'railtap', position: { x: rightX, y: wireY - 5 }, data: {}, draggable: false, selectable: false },
    );

    // symbols grouped by column
    const byCol = new Map<number, typeof rungSymbols>();
    for (const sym of rungSymbols) {
      const arr = byCol.get(sym.col) ?? [];
      arr.push(sym);
      byCol.set(sym.col, arr);
    }
    const cols = [...byCol.keys()].sort((a, b) => a - b);

    for (const sym of rungSymbols) {
      nodes.push({
        id: `sym-${sym.id}`,
        type: 'symbol',
        position: { x: COL0 + sym.col * COL_W, y: wireY + sym.branch * BRANCH_DY - SYM_HALF },
        data: {
          symType: sym.type,
          label: sym.label,
          selected: sym.id === selectedSymbolId,
        },
        draggable: false,
        selectable: false,
      });
    }

    // wiring: leftTap → col0 syms → ... → colN syms → rightTap (cartesian per adjacent col)
    const link = (from: string, to: string) =>
      edges.push({ id: `e-${from}-${to}`, source: from, target: to, type: 'smoothstep', style: { stroke: 'var(--mantine-color-gray-5)' } });

    if (cols.length === 0) {
      link(`tapL-${rung.id}`, `tapR-${rung.id}`);
    } else {
      for (const sym of byCol.get(cols[0]!)!) link(`tapL-${rung.id}`, `sym-${sym.id}`);
      for (let c = 0; c < cols.length - 1; c++) {
        for (const a of byCol.get(cols[c]!)!) {
          for (const b of byCol.get(cols[c + 1]!)!) link(`sym-${a.id}`, `sym-${b.id}`);
        }
      }
      for (const sym of byCol.get(cols[cols.length - 1]!)!) link(`sym-${sym.id}`, `tapR-${rung.id}`);
    }
  });

  return { nodes, edges, height };
}

/** React Flow ladder rendering of a control schematic, with click-to-select. */
export function SchematicCanvas({
  schematic,
  selectedRungId,
  selectedSymbolId,
  onSelectRung,
  onSelectSymbol,
}: CanvasProps) {
  const { nodes, edges, height } = useMemo(
    () => buildLadder(schematic, selectedRungId, selectedSymbolId),
    [schematic, selectedRungId, selectedSymbolId],
  );

  return (
    <Box
      h={Math.max(340, Math.min(height + 40, 620))}
      style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={SCHEMATIC_NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          onNodeClick={(_e, node) => {
            if (node.id.startsWith('bg-')) onSelectRung(node.id.slice(3));
            else if (node.id.startsWith('sym-')) onSelectSymbol(node.id.slice(4));
          }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </Box>
  );
}
