import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
} from '@xyflow/react';
import { Badge, Box, Button, Card, Group, Paper, Select, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAirConditioning,
  IconBattery2,
  IconBolt,
  IconBulb,
  IconChargingPile,
  IconCircuitSwitchOpen,
  IconDroplet,
  IconEngine,
  IconHandMove,
  IconPlug,
  IconPlugConnected,
  IconScale,
  IconSitemap,
  IconSolarPanel,
  IconSparkles,
} from '@tabler/icons-react';
import type { CircuitInput, LoadKind, PanelInput, PanelResult, SourcesResult } from '@shared/types';
import { STANDARD_BREAKER_RATINGS_A } from '@shared/standards';
import { STANDARD_SECTIONS_MM2 } from '@shared/standards/conductors';
import { balancePhases, type PhaseCircuit } from '@shared/engine';
import { NODE_TYPES, OVERRIDE_MIME, type BranchNodeData } from '@renderer/screens/sld/nodes';
import { circuitIssues, incomerIssues, busbarIssues } from '@renderer/lib/nodeIssues';
import { useProjectStore } from '@renderer/state/projectStore';
import { formatAmps } from '@renderer/lib/format';
import { CircuitEditor } from '@renderer/features/builder/CircuitEditor';
import { PanelSettingsEditor } from '@renderer/features/builder/PanelSettingsEditor';
import {
  SourceEditor,
  DEFAULT_SOLAR,
  DEFAULT_BATTERY,
  DEFAULT_GENERATOR,
  type SourceKind,
} from '@renderer/features/builder/SourceEditor';
import { useSystemResult } from '@renderer/state/useSystemResult';

/* ------------------------------- palette model ----------------------------- */

/** What a palette card creates when dropped on the canvas. */
type PaletteAction =
  | { type: 'load'; loadKind: LoadKind; defaults: Partial<CircuitInput>; nameKey: string }
  | { type: 'spare' }
  | { type: 'subpanel' }
  | { type: 'connectPanel'; childPanelId: string }
  | { type: 'source'; kind: SourceKind }
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

/**
 * Existing panels that can be adopted as a feeder under `panelId`: those with no
 * parent yet (unassigned), excluding the panel itself and any panel from which
 * the current panel is reachable (which would create a feeder cycle).
 */
function availableChildPanels(panels: PanelInput[], panelId: string): PanelInput[] {
  const parentOf = new Map<string, string>();
  for (const p of panels) for (const c of p.circuits) if (c.feedsPanelId) parentOf.set(c.feedsPanelId, p.id);
  const wouldCycle = (childId: string): boolean => {
    let cur: string | undefined = panelId;
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur)) {
      if (cur === childId) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };
  return panels.filter((p) => p.id !== panelId && !parentOf.has(p.id) && !wouldCycle(p.id));
}

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
    busbar: `${result.busbar.csaMm2}|${result.busbar.ampacityA}|${result.busbarSections.length}`,
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
/** Vertical pitch between consecutive busbar sections (bar + its branch row). */
const SECTION_DY = 270;

/** Minimal translate signature buildGraph needs (avoids an i18next type import). */
type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Width (px) a busbar bar spans for a section carrying `ways` branches. */
function sectionWidthPx(ways: number): number {
  return Math.max(ways, 1) * (BRANCH_W + BRANCH_GAP) - BRANCH_GAP;
}

function sourceNodeLines(kind: SourceKind, sized: SourcesResult | undefined): string[] {
  if (kind === 'solar' && sized?.solar) return [`${sized.solar.arrayKwp} kWp`, `Inv ${sized.solar.inverterKw} kW`];
  if (kind === 'battery' && sized?.battery)
    return [`${sized.battery.installedKwh} kWh`, `Inv ${sized.battery.inverterKw} kW`];
  if (kind === 'generator' && sized?.generator)
    return [`${sized.generator.ratingKva} kVA`, sized.generator.mode];
  return ['sized vs demand'];
}

function buildGraph(
  panel: PanelInput,
  result: PanelResult,
  changes: Map<string, string[]>,
  onOverride: (circuitId: string, kind: 'breaker' | 'cable', value: number) => void,
  enabledSources: SourceKind[],
  sizedSources: SourcesResult | undefined,
  feederChild: (childPanelId: string) => { childName: string; childIncomerA?: string } | undefined,
  t: TFn,
): { nodes: Node[]; edges: Edge[] } {
  const sections = result.busbarSections;
  const multi = sections.length > 1;
  const byId = new Map(result.circuits.map((c) => [c.circuitId, c] as const));
  const widest = Math.max(...sections.map((s) => sectionWidthPx(s.ways)), BRANCH_W);
  const incomerX = widest / 2 - 90;

  const nodes: Node[] = [
    {
      id: 'incomer',
      type: 'incomer',
      position: { x: incomerX, y: 0 },
      data: {
        label: panel.tag ? `${panel.tag} — ${panel.name}` : panel.name,
        ratingA: `${result.incomer.breaker.deviceClass} ${result.incomer.breaker.ratingA}A ${result.incomer.poles}P · ${formatAmps(result.totalDemandCurrentA)}`,
        issues: incomerIssues(result.warnings),
      },
      draggable: false,
    },
  ];
  const edges: Edge[] = [];

  // Distributed energy sources sit above the incomer and feed into it.
  const SRC_GAP = 168;
  const srcRowW = Math.max(enabledSources.length, 1) * SRC_GAP - SRC_GAP;
  enabledSources.forEach((kind, i) => {
    const id = `source-${kind}`;
    nodes.push({
      id,
      type: 'source',
      position: { x: incomerX + 90 - srcRowW / 2 - 75 + i * SRC_GAP, y: -150 },
      data: {
        kind,
        title: kind === 'solar' ? 'Solar PV' : kind === 'battery' ? 'Battery' : 'Generator',
        lines: sourceNodeLines(kind, sizedSources),
      },
      draggable: false,
    });
    edges.push({
      id: `e-${id}-incomer`,
      source: id,
      target: 'incomer',
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--mantine-color-yellow-6)', strokeDasharray: '4 3' },
    });
  });

  // One busbar bar per section, stacked vertically, each carrying its own ways.
  // Every section is fed RADIALLY from the incomer (its own dropper) — not
  // chained through the previous bar — so each bar carries only its own group
  // and the per-section sizing is valid (IEC 61439 distribution busbars).
  sections.forEach((section, k) => {
    const busbarY = BUSBAR_Y + k * SECTION_DY;
    const branchY = busbarY + (BRANCH_Y - BUSBAR_Y);
    const busId = `busbar-${k}`;
    const inadequate = section.busbar.withstand ? !section.busbar.withstand.adequate : false;
    nodes.push({
      id: busId,
      type: 'busbar',
      position: { x: -10, y: busbarY },
      data: {
        label: multi ? t('vbuilder.busbarSection', { index: section.index }) : t('vbuilder.busbar'),
        ampacity: `${formatAmps(section.busbar.ampacityA)} · ${section.busbar.widthMm}×${section.busbar.thicknessMm} mm`,
        widthPx: sectionWidthPx(section.ways) + 20,
        waysLabel: multi ? t('vbuilder.waysCount', { count: section.ways }) : undefined,
        inadequate,
        manualBreak: section.manualBreak,
        issues: inadequate ? busbarIssues(result.warnings) : undefined,
      },
      draggable: false,
    });
    edges.push({
      id: `e-incomer-busbar-${k}`,
      source: 'incomer',
      target: busId,
      targetHandle: k === 0 ? 'top' : 'lin',
      type: 'smoothstep',
      style: k > 0 ? { stroke: 'var(--mantine-color-indigo-4)', strokeWidth: 2 } : undefined,
    });

    section.circuitIds.forEach((cid, j) => {
      const c = byId.get(cid);
      if (!c) return;
      const x = j * (BRANCH_W + BRANCH_GAP);
      const input = panel.circuits.find((ci) => ci.id === cid);
      const data: BranchNodeData = {
        name: c.name,
        breaker: `${c.breaker.deviceClass} ${c.breaker.ratingA}A/${c.breaker.curve}`,
        cable: `${c.cable.runsPerPhase && c.cable.runsPerPhase > 1 ? `${c.cable.runsPerPhase}× ` : ''}${c.cable.csaMm2} mm²`,
        starter: c.control?.starterType.replace('_', '-'),
        warn: !c.voltageDrop.withinLimit,
        changed: changes.get(cid),
        breakerOverridden: c.breaker.overridden === true,
        cableOverridden: input?.cableOverrideMm2 !== undefined,
        utilPct:
          c.cable.deratedIzA > 0
            ? Math.round((c.designCurrentA / c.cable.deratedIzA) * 100)
            : undefined,
        issues: circuitIssues(result.warnings, cid),
        feeder: input?.feedsPanelId ? feederChild(input.feedsPanelId) : undefined,
        onDropOverride: (kind, value) => onOverride(cid, kind, value),
      };
      // Branch nodes are draggable so the user can reorder ways left-to-right
      // (committed on drag-stop); the incomer / busbar / source nodes are fixed.
      nodes.push({ id: cid, type: 'branch', position: { x, y: branchY }, data, draggable: true });
      edges.push({
        id: `e-busbar-${cid}`,
        source: busId,
        sourceHandle: 'bottom',
        target: cid,
        type: 'smoothstep',
        animated: changes.has(cid),
        style: data.warn
          ? { stroke: 'var(--mantine-color-red-5)' }
          : changes.has(cid)
            ? { stroke: 'var(--mantine-color-teal-5)' }
            : undefined,
      });
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

/**
 * Draggable override card: pick a rating/section on the card, then drag it onto
 * a SPECIFIC circuit node to pin that value manually (shown violet). Dropping
 * on empty canvas does nothing except a hint — overrides need a target.
 */
function OverrideCard({
  kind,
  labelKey,
  options,
  unit,
}: {
  kind: 'breaker' | 'cable';
  labelKey: string;
  options: number[];
  unit: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(String(options[0] ?? 16));
  return (
    <Paper
      withBorder
      radius="md"
      p={6}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(OVERRIDE_MIME, JSON.stringify({ kind, value: Number(value) }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={{
        cursor: 'grab',
        userSelect: 'none',
        borderColor: 'var(--mantine-color-violet-4)',
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="sm" variant="light" color="violet">
            <IconBolt size={14} />
          </ThemeIcon>
          <Text size="xs" fw={500} lineClamp={1}>
            {t(labelKey)}
          </Text>
        </Group>
        <Select
          size="xs"
          w={86}
          data={options.map((o) => ({ value: String(o), label: `${o} ${unit}` }))}
          value={value}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(v) => v && setValue(v)}
          // Keep the select usable inside a draggable card.
          onPointerDown={(e) => e.stopPropagation()}
        />
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
  const updateCircuit = useProjectStore((s) => s.updateCircuit);
  const reorderCircuits = useProjectStore((s) => s.reorderCircuits);
  const setPhaseAssignments = useProjectStore((s) => s.setPhaseAssignments);
  const connectPanelAsFeeder = useProjectStore((s) => s.connectPanelAsFeeder);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const allPanels = useProjectStore((s) => s.project.panels);
  const orphanPanels = useMemo(
    () => availableChildPanels(allPanels, panel.id),
    [allPanels, panel.id],
  );

  // Double-click a node or its cable edge to edit that circuit inline.
  const [editing, setEditing] = useState<{ circuitId: string; focus: 'device' | 'cable' } | null>(
    null,
  );
  const editingCircuit = editing ? panel.circuits.find((c) => c.id === editing.circuitId) : undefined;
  const editingResult = editing
    ? result.circuits.find((c) => c.circuitId === editing.circuitId)
    : undefined;

  // Energy sources (project-level) — shown on a building-entry (utility) panel.
  const isRoot = panel.sourceType === 'utility';
  const sourcesConfig = useProjectStore((s) => s.project.sources);
  const updateSources = useProjectStore((s) => s.updateSources);
  const system = useSystemResult();
  const sizedSources = system.sources;
  /** Label + incomer current for a sub-panel a feeder way points at. */
  const feederChild = (childPanelId: string): { childName: string; childIncomerA?: string } | undefined => {
    const child = allPanels.find((p) => p.id === childPanelId);
    if (!child) return undefined;
    const childRes = system.panels[childPanelId];
    return {
      childName: child.tag ? `${child.tag} — ${child.name}` : child.name,
      childIncomerA: childRes ? formatAmps(childRes.totalDemandCurrentA) : undefined,
    };
  };
  const enabledSources = useMemo<SourceKind[]>(() => {
    if (!isRoot) return [];
    const out: SourceKind[] = [];
    if (sourcesConfig?.solar?.enabled) out.push('solar');
    if (sourcesConfig?.battery?.enabled) out.push('battery');
    if (sourcesConfig?.generator?.enabled) out.push('generator');
    return out;
  }, [isRoot, sourcesConfig]);

  // Which secondary editor is open (panel settings, or a source).
  const [panelSettingsOpen, setPanelSettingsOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceKind | null>(null);

  const enableSource = (kind: SourceKind) => {
    if (kind === 'solar') updateSources({ solar: { ...DEFAULT_SOLAR, ...sourcesConfig?.solar, enabled: true } });
    else if (kind === 'battery')
      updateSources({ battery: { ...DEFAULT_BATTERY, ...sourcesConfig?.battery, enabled: true } });
    else updateSources({ generator: { ...DEFAULT_GENERATOR, ...sourcesConfig?.generator, enabled: true } });
    setEditingSource(kind);
  };

  /** Pin a manual breaker rating / cable minimum onto a specific circuit. */
  const applyOverride = (circuitId: string, kind: 'breaker' | 'cable', value: number) => {
    updateCircuit(
      panel.id,
      circuitId,
      kind === 'breaker' ? { breakerOverrideA: value } : { cableOverrideMm2: value },
    );
    notifications.show({
      message: t('vbuilder.overrideApplied', {
        value: kind === 'breaker' ? `${value} A` : `${value} mm²`,
      }),
      color: 'violet',
    });
  };

  /**
   * One-click phase rebalance: re-optimise ALL single-phase ways across L1/L2/L3
   * (ignoring any current pins) and pin the result, so the as-built schedule
   * carries a stable, balanced phase assignment.
   */
  const onAutoBalance = () => {
    const phaseCircuits: PhaseCircuit[] = result.circuits.map((cr) => ({
      id: cr.circuitId,
      currentA: cr.designCurrentA,
      threePhase: cr.phase === '3ph',
    }));
    const bal = balancePhases(phaseCircuits, panel.system);
    const assignment: Record<string, 'L1' | 'L2' | 'L3'> = {};
    for (const cr of result.circuits) {
      const a = bal.assignment[cr.circuitId];
      if (a === 'L1' || a === 'L2' || a === 'L3') assignment[cr.circuitId] = a;
    }
    if (Object.keys(assignment).length === 0) {
      notifications.show({ message: t('vbuilder.phaseNothing'), color: 'yellow' });
      return;
    }
    setPhaseAssignments(panel.id, assignment);
    notifications.show({ message: t('vbuilder.phaseBalanced', { pct: bal.imbalancePct }), color: 'teal' });
  };

  // Change marking: diff this result against the previous one for this panel.
  const prevRef = useRef<{ panelId: string; fp: PanelFingerprint } | null>(null);
  const changes = useMemo(() => {
    const fp = fingerprint(result);
    const prev = prevRef.current;
    prevRef.current = { panelId: panel.id, fp };
    if (!prev || prev.panelId !== panel.id) return new Map<string, string[]>();
    return diffResults(prev.fp, fp);
  }, [result, panel.id]);

  const graph = useMemo(
    () => buildGraph(panel, result, changes, applyOverride, enabledSources, sizedSources, feederChild, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panel, result, changes, enabledSources, sizedSources, t],
  );

  // The canvas is a controlled-but-locally-draggable projection: React Flow owns
  // transient drag offsets, and we re-sync to the deterministic layout whenever
  // the model recomputes (after a reorder commit or any other edit).
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(graph.nodes);
  useEffect(() => {
    setRfNodes(graph.nodes);
  }, [graph.nodes, setRfNodes]);

  /** Commit a drag: re-derive the way order from the dropped positions. */
  const onNodeDragStop = () => {
    const orderedIds = rfNodes
      .filter((n) => n.type === 'branch')
      .slice()
      .sort((a, b) => {
        // Busbar sections are stacked ~SECTION_DY apart — bucket by row first,
        // then left-to-right within the row.
        const ra = Math.round(a.position.y / SECTION_DY);
        const rb = Math.round(b.position.y / SECTION_DY);
        return ra === rb ? a.position.x - b.position.x : ra - rb;
      })
      .map((n) => n.id);
    // Snap back to the canonical layout; a real reorder recomputes and the sync
    // effect re-lays-out in the new order (a drop-in-place just snaps back).
    setRfNodes(graph.nodes);
    reorderCircuits(panel.id, orderedIds);
  };

  const onDrop = (e: React.DragEvent) => {
    // An override card needs a circuit target — landing on empty canvas just hints.
    if (e.dataTransfer.types.includes(OVERRIDE_MIME)) {
      e.preventDefault();
      notifications.show({ message: t('vbuilder.dropOnCircuit'), color: 'yellow' });
      return;
    }
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
      case 'connectPanel': {
        const child = allPanels.find((p) => p.id === action.childPanelId);
        connectPanelAsFeeder(panel.id, action.childPanelId);
        notifications.show({
          message: t('vbuilder.panelConnected', { name: child ? (child.tag ?? child.name) : '' }),
          color: 'teal',
        });
        break;
      }
      case 'supply':
        updatePanel(panel.id, { sourceType: action.sourceType });
        notifications.show({ message: t('vbuilder.supplySet'), color: 'teal' });
        break;
      case 'source':
        enableSource(action.kind);
        break;
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Group gap={6}>
          <IconHandMove size={16} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {t('vbuilder.hint')} {t('vbuilder.editHint')}
          </Text>
        </Group>
        <Group gap="xs">
          {changes.size > 0 && (
            <Badge variant="light" color="teal" leftSection={<IconSparkles size={12} />}>
              {t('vbuilder.resized', { count: changes.size })}
            </Badge>
          )}
          {panel.system === '3ph' && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconScale size={14} />}
              onClick={onAutoBalance}
            >
              {t('vbuilder.autoBalance')}
            </Button>
          )}
        </Group>
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
            <div>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: '0.04em' }}>
                {t('vbuilder.groupOverrides')}
              </Text>
              <SimpleGrid cols={1} spacing={6}>
                <OverrideCard
                  kind="breaker"
                  labelKey="vbuilder.breakerOverride"
                  options={[...STANDARD_BREAKER_RATINGS_A]}
                  unit="A"
                />
                <OverrideCard
                  kind="cable"
                  labelKey="vbuilder.cableOverride"
                  options={[...STANDARD_SECTIONS_MM2]}
                  unit="mm²"
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed" mt={6}>
                {t('vbuilder.overrideHint')}
              </Text>
            </div>
            {isRoot && (
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: '0.04em' }}>
                  {t('vbuilder.groupSources')}
                </Text>
                <SimpleGrid cols={1} spacing={6}>
                  {([
                    { kind: 'solar', icon: <IconSolarPanel size={16} />, label: t('vbuilder.solar') },
                    { kind: 'battery', icon: <IconBattery2 size={16} />, label: t('vbuilder.battery') },
                    { kind: 'generator', icon: <IconBolt size={16} />, label: t('vbuilder.generator') },
                  ] as const).map((src) => (
                    <Paper
                      key={src.kind}
                      withBorder
                      radius="md"
                      p={6}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          DND_MIME,
                          JSON.stringify({ type: 'source', kind: src.kind }),
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      style={{ cursor: 'grab', userSelect: 'none' }}
                    >
                      <Group gap={8} wrap="nowrap">
                        <ThemeIcon size="sm" variant="light" color="yellow">
                          {src.icon}
                        </ThemeIcon>
                        <Text size="xs" fw={500} lineClamp={1}>
                          {src.label}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt={6}>
                  {t('vbuilder.sourcesHint')}
                </Text>
              </div>
            )}
            {orphanPanels.length > 0 && (
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: '0.04em' }}>
                  {t('vbuilder.groupPanels')}
                </Text>
                <SimpleGrid cols={1} spacing={6}>
                  {orphanPanels.map((op) => (
                    <Paper
                      key={op.id}
                      withBorder
                      radius="md"
                      p={6}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          DND_MIME,
                          JSON.stringify({ type: 'connectPanel', childPanelId: op.id }),
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      style={{ cursor: 'grab', userSelect: 'none' }}
                    >
                      <Group gap={8} wrap="nowrap">
                        <ThemeIcon size="sm" variant="light" color="teal">
                          <IconSitemap size={14} />
                        </ThemeIcon>
                        <Text size="xs" fw={500} lineClamp={1}>
                          {op.tag ? `${op.tag} — ${op.name}` : op.name}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt={6}>
                  {t('vbuilder.panelsHint')}
                </Text>
              </div>
            )}
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
            background: 'var(--mantine-color-body)',
            overflow: 'hidden',
          }}
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes(DND_MIME) ||
              e.dataTransfer.types.includes(OVERRIDE_MIME)
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={onDrop}
        >
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={graph.edges}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              nodesConnectable={false}
              elementsSelectable={false}
              // Reserve double-click for opening the circuit editor; React Flow's
              // default zoom-on-double-click would otherwise swallow it.
              zoomOnDoubleClick={false}
              onNodeDoubleClick={(_, node) => {
                if (node.type === 'branch') {
                  // A feeder way represents a sub-panel — drill into it instead
                  // of editing the feeder circuit (its MCB shows on the node).
                  const circ = panel.circuits.find((c) => c.id === node.id);
                  if (circ?.feedsPanelId) setActivePanel(circ.feedsPanelId);
                  else setEditing({ circuitId: node.id, focus: 'device' });
                } else if (node.type === 'incomer' || node.type === 'busbar') setPanelSettingsOpen(true);
                else if (node.type === 'source') {
                  setEditingSource((node.data as { kind: SourceKind }).kind);
                }
              }}
              onEdgeDoubleClick={(_, edge) => {
                const id = edge.id.startsWith('e-busbar-') ? edge.id.slice('e-busbar-'.length) : '';
                if (id) setEditing({ circuitId: id, focus: 'cable' });
              }}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>
      </Group>

      {editing && editingCircuit && (
        <CircuitEditor
          panelId={panel.id}
          circuit={editingCircuit}
          result={editingResult}
          focus={editing.focus}
          opened
          onClose={() => setEditing(null)}
        />
      )}
      <PanelSettingsEditor panel={panel} opened={panelSettingsOpen} onClose={() => setPanelSettingsOpen(false)} />
      {editingSource && (
        <SourceEditor kind={editingSource} opened onClose={() => setEditingSource(null)} />
      )}
    </Stack>
  );
}
