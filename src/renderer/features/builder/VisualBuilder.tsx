import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Badge, Box, Card, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAirConditioning,
  IconBolt,
  IconBulb,
  IconChargingPile,
  IconCircuitSwitchOpen,
  IconDroplet,
  IconEngine,
  IconHandMove,
  IconPlug,
  IconPlugConnected,
  IconSitemap,
  IconSparkles,
} from '@tabler/icons-react';
import type { CircuitInput, LoadKind, PanelInput, PanelResult } from '@shared/types';
import { NODE_TYPES, type BranchNodeData } from '@renderer/screens/sld/nodes';
import { useProjectStore } from '@renderer/state/projectStore';
import { formatAmps } from '@renderer/lib/format';

/* ------------------------------- palette model ----------------------------- */

/** What a palette card creates when dropped on the canvas. */
type PaletteAction =
  | { type: 'load'; loadKind: LoadKind; defaults: Partial<CircuitInput>; nameKey: string }
  | { type: 'spare' }
  | { type: 'subpanel' }
  | { type: 'supply'; sourceType: PanelInput['sourceType'] };

interface PaletteItem {
  key: string;
  /** i18n key under `vbuilder.*` for the card label. */
  labelKey: string;
  icon: React.ReactNode;
  action: PaletteAction;
}

interface PaletteGroup {
  labelKey: string;
  items: PaletteItem[];
}

const PALETTE: PaletteGroup[] = [
  {
    labelKey: 'vbuilder.groupLoads',
    items: [
      {
        key: 'lighting',
        labelKey: 'vbuilder.lighting',
        icon: <IconBulb size={16} />,
        action: {
          type: 'load',
          loadKind: 'lighting',
          nameKey: 'vbuilder.lighting',
          defaults: { loadW: 1200, isLighting: true, cosPhi: 0.9 },
        },
      },
      {
        key: 'socket',
        labelKey: 'vbuilder.sockets',
        icon: <IconPlug size={16} />,
        action: {
          type: 'load',
          loadKind: 'socket',
          nameKey: 'vbuilder.sockets',
          defaults: { loadW: 2000, cosPhi: 0.95 },
        },
      },
      {
        key: 'hvac',
        labelKey: 'vbuilder.hvac',
        icon: <IconAirConditioning size={16} />,
        action: {
          type: 'load',
          loadKind: 'hvac',
          nameKey: 'vbuilder.hvac',
          defaults: { loadW: 5500, cosPhi: 0.9 },
        },
      },
      {
        key: 'motor',
        labelKey: 'vbuilder.motor',
        icon: <IconEngine size={16} />,
        action: {
          type: 'load',
          loadKind: 'motor',
          nameKey: 'vbuilder.motor',
          defaults: { loadW: 0, motorKw: 5.5, starterType: 'DOL', cosPhi: 0.85 },
        },
      },
      {
        key: 'pump',
        labelKey: 'vbuilder.pump',
        icon: <IconDroplet size={16} />,
        action: {
          type: 'load',
          loadKind: 'pump',
          nameKey: 'vbuilder.pump',
          defaults: { loadW: 0, motorKw: 4, starterType: 'DOL', cosPhi: 0.85 },
        },
      },
      {
        key: 'ev',
        labelKey: 'vbuilder.ev',
        icon: <IconChargingPile size={16} />,
        action: {
          type: 'load',
          loadKind: 'ev_charger',
          nameKey: 'vbuilder.ev',
          defaults: { loadW: 7400, cosPhi: 0.98 },
        },
      },
      {
        key: 'general',
        labelKey: 'vbuilder.general',
        icon: <IconBolt size={16} />,
        action: {
          type: 'load',
          loadKind: 'general',
          nameKey: 'vbuilder.general',
          defaults: { loadW: 2000, cosPhi: 0.85 },
        },
      },
    ],
  },
  {
    labelKey: 'vbuilder.groupDistribution',
    items: [
      {
        key: 'spare',
        labelKey: 'vbuilder.spare',
        icon: <IconCircuitSwitchOpen size={16} />,
        action: { type: 'spare' },
      },
      {
        key: 'subpanel',
        labelKey: 'vbuilder.subpanel',
        icon: <IconSitemap size={16} />,
        action: { type: 'subpanel' },
      },
    ],
  },
  {
    labelKey: 'vbuilder.groupSupply',
    items: [
      {
        key: 'utility',
        labelKey: 'vbuilder.utility',
        icon: <IconPlugConnected size={16} />,
        action: { type: 'supply', sourceType: 'utility' },
      },
      {
        key: 'feeder-supply',
        labelKey: 'vbuilder.fedByParent',
        icon: <IconSitemap size={16} />,
        action: { type: 'supply', sourceType: 'feeder' },
      },
    ],
  },
];

const DND_MIME = 'application/x-panelmaker-item';

/* ------------------------------ change marking ----------------------------- */

/** Per-circuit fingerprint of the sizing outputs the user actually sees. */
interface CircuitSizing {
  designA: number;
  breaker: string;
  cable: number;
  vdOk: boolean;
}

interface PanelFingerprint {
  circuits: Map<string, CircuitSizing>;
  busbar: string;
  incomerA: number;
}

function fingerprint(result: PanelResult): PanelFingerprint {
  const circuits = new Map<string, CircuitSizing>();
  for (const c of result.circuits) {
    circuits.set(c.circuitId, {
      designA: c.designCurrentA,
      breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
      cable: c.cable.csaMm2,
      vdOk: c.voltageDrop.withinLimit,
    });
  }
  return {
    circuits,
    busbar: `${result.busbar.csaMm2}|${result.busbar.ampacityA}`,
    incomerA: result.totalDemandCurrentA,
  };
}

/**
 * Diff two consecutive computed results into human change notes per circuit id
 * (plus 'busbar' / 'incomer' pseudo-ids), so the canvas can mark exactly what
 * the last edit re-sized — including ripple effects away from the edited node.
 */
function diffResults(prev: PanelFingerprint, next: PanelFingerprint): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, n] of next.circuits) {
    const p = prev.circuits.get(id);
    if (!p) {
      out.set(id, ['new']);
      continue;
    }
    const notes: string[] = [];
    if (p.breaker !== n.breaker) notes.push(`${p.breaker.split(' ')[1]} → ${n.breaker.split(' ')[1]}`);
    if (p.cable !== n.cable) notes.push(`${p.cable} → ${n.cable} mm²`);
    if (p.designA !== n.designA) notes.push(`${p.designA} → ${n.designA} A`);
    if (p.vdOk !== n.vdOk) notes.push(n.vdOk ? 'Vd ok' : 'Vd!');
    if (notes.length > 0) out.set(id, notes);
  }
  if (prev.busbar !== next.busbar) out.set('busbar', ['busbar re-sized']);
  if (prev.incomerA !== next.incomerA) {
    out.set('incomer', [`${prev.incomerA} → ${next.incomerA} A`]);
  }
  return out;
}

/* --------------------------------- canvas ---------------------------------- */

const BRANCH_W = 160;
const BRANCH_GAP = 24;
const BUSBAR_Y = 110;
const BRANCH_Y = 200;

function buildGraph(
  panel: PanelInput,
  result: PanelResult,
  changes: Map<string, string[]>,
): { nodes: Node[]; edges: Edge[] } {
  const branches = result.circuits;
  const totalWidth = Math.max(branches.length, 1) * (BRANCH_W + BRANCH_GAP) - BRANCH_GAP;
  const busbarCenterX = totalWidth / 2;

  const nodes: Node[] = [
    {
      id: 'incomer',
      type: 'incomer',
      position: { x: busbarCenterX - 90, y: 0 },
      data: {
        label: panel.tag ? `${panel.tag} — ${panel.name}` : panel.name,
        ratingA: formatAmps(result.totalDemandCurrentA),
      },
      draggable: false,
    },
    {
      id: 'busbar',
      type: 'busbar',
      position: { x: busbarCenterX - 310, y: BUSBAR_Y },
      data: {
        label: 'Busbar',
        ampacity: `${formatAmps(result.busbar.ampacityA)} · ${result.busbar.widthMm}×${result.busbar.thicknessMm} mm`,
      },
      draggable: false,
    },
  ];

  const edges: Edge[] = [
    { id: 'e-incomer-busbar', source: 'incomer', target: 'busbar', type: 'smoothstep' },
  ];

  branches.forEach((c, i) => {
    const x = i * (BRANCH_W + BRANCH_GAP);
    const data: BranchNodeData = {
      name: c.name,
      breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
      cable: `${c.cable.csaMm2} mm²`,
      starter: c.control?.starterType.replace('_', '-'),
      warn: !c.voltageDrop.withinLimit,
      changed: changes.get(c.circuitId),
    };
    nodes.push({ id: c.circuitId, type: 'branch', position: { x, y: BRANCH_Y }, data, draggable: false });
    edges.push({
      id: `e-busbar-${c.circuitId}`,
      source: 'busbar',
      target: c.circuitId,
      type: 'smoothstep',
      animated: changes.has(c.circuitId),
      style: data.warn
        ? { stroke: 'var(--mantine-color-red-5)' }
        : changes.has(c.circuitId)
          ? { stroke: 'var(--mantine-color-teal-5)' }
          : undefined,
    });
  });

  return { nodes, edges };
}

/* --------------------------------- palette --------------------------------- */

function PaletteCard({ item }: { item: PaletteItem }) {
  const { t } = useTranslation();
  return (
    <Paper
      withBorder
      radius="md"
      p={6}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, JSON.stringify(item.action));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={{ cursor: 'grab', userSelect: 'none' }}
    >
      <Group gap={8} wrap="nowrap">
        <ThemeIcon size="sm" variant="light" color="indigo">
          {item.icon}
        </ThemeIcon>
        <Text size="xs" fw={500} lineClamp={1}>
          {t(item.labelKey)}
        </Text>
      </Group>
    </Paper>
  );
}

/* ------------------------------ visual builder ----------------------------- */

/**
 * Drag-and-drop panel builder: drag loads / spare ways / sub-panels / supply
 * cards from the palette onto the live single-line canvas. Every drop is a
 * normal store edit, so the pure engine recomputes instantly and the canvas
 * re-renders with the new sizing — and the diff against the previous result
 * marks exactly which devices the edit re-sized (teal Δ), including ripple
 * effects on the busbar and incomer.
 */
export function VisualBuilder({ panel, result }: { panel: PanelInput; result: PanelResult }) {
  const { t } = useTranslation();
  const addCircuitConfigured = useProjectStore((s) => s.addCircuitConfigured);
  const addSubPanel = useProjectStore((s) => s.addSubPanel);
  const updatePanel = useProjectStore((s) => s.updatePanel);

  // Change marking: diff this result against the previous one for this panel.
  const prevRef = useRef<{ panelId: string; fp: PanelFingerprint } | null>(null);
  const changes = useMemo(() => {
    const fp = fingerprint(result);
    const prev = prevRef.current;
    prevRef.current = { panelId: panel.id, fp };
    if (!prev || prev.panelId !== panel.id) return new Map<string, string[]>();
    return diffResults(prev.fp, fp);
  }, [result, panel.id]);

  const { nodes, edges } = useMemo(
    () => buildGraph(panel, result, changes),
    [panel, result, changes],
  );

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    e.preventDefault();
    let action: PaletteAction;
    try {
      action = JSON.parse(raw) as PaletteAction;
    } catch {
      return;
    }
    switch (action.type) {
      case 'load': {
        const count = panel.circuits.length + 1;
        addCircuitConfigured(panel.id, {
          name: `${t(action.nameKey)} ${count}`,
          role: 'branch',
          loadW: 0,
          cosPhi: 0.85,
          lengthM: 20,
          loadKind: action.loadKind,
          isLighting: action.loadKind === 'lighting',
          demandFactor: 1,
          ...action.defaults,
        });
        notifications.show({ message: t('vbuilder.added', { name: t(action.nameKey) }), color: 'teal' });
        break;
      }
      case 'spare':
        addCircuitConfigured(panel.id, {
          name: t('vbuilder.spareName'),
          role: 'branch',
          loadW: 0,
          cosPhi: 0.85,
          lengthM: 1,
          loadKind: 'general',
          isLighting: false,
          demandFactor: 0,
        });
        notifications.show({ message: t('vbuilder.added', { name: t('vbuilder.spare') }), color: 'teal' });
        break;
      case 'subpanel':
        addSubPanel(panel.id);
        notifications.show({ message: t('vbuilder.subpanelAdded'), color: 'teal' });
        break;
      case 'supply':
        updatePanel(panel.id, { sourceType: action.sourceType });
        notifications.show({ message: t('vbuilder.supplySet'), color: 'teal' });
        break;
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Group gap={6}>
          <IconHandMove size={16} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {t('vbuilder.hint')}
          </Text>
        </Group>
        {changes.size > 0 && (
          <Badge variant="light" color="teal" leftSection={<IconSparkles size={12} />}>
            {t('vbuilder.resized', { count: changes.size })}
          </Badge>
        )}
      </Group>

      <Group align="stretch" gap="sm" wrap="nowrap">
        {/* Palette */}
        <Card withBorder radius="lg" padding="sm" w={200} style={{ flexShrink: 0 }}>
          <Stack gap="sm">
            {PALETTE.map((group) => (
              <div key={group.labelKey}>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: '0.04em' }}>
                  {t(group.labelKey)}
                </Text>
                <SimpleGrid cols={1} spacing={6}>
                  {group.items.map((item) => (
                    <PaletteCard key={item.key} item={item} />
                  ))}
                </SimpleGrid>
              </div>
            ))}
          </Stack>
        </Card>

        {/* Live canvas */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            height: 480,
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-lg)',
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={onDrop}
        >
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>
      </Group>
    </Stack>
  );
}
