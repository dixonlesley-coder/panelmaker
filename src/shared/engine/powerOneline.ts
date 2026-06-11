import type { SystemResult } from '../types/results';
import type { PowerEdge, PowerInterlock, PowerNode, PowerOneline } from '../types/oneline';

/**
 * Build the hybrid power one-line from the computed system: the utility (LV, or
 * MV through a transformer), an optional generator transferred by an ATS, and
 * grid-tied solar PV and/or battery converging on the main LV bus — together
 * with the source interlocks (mains<->genset mutual exclusion, PV anti-islanding,
 * battery transfer).
 */
export function computePowerOneline(system: SystemResult): PowerOneline {
  const nodes: PowerNode[] = [];
  const edges: PowerEdge[] = [];
  const interlocks: PowerInterlock[] = [];

  let e = 0;
  const edge = (from: string, to: string, label?: string) =>
    edges.push({ id: `pe${e++}`, from, to, ...(label ? { label } : {}) });

  const rootId = system.order[0];
  const mainName = (rootId && system.panels[rootId]?.name) || 'Main panel';

  nodes.push({ id: 'bus', kind: 'bus', label: 'Main LV bus', sub: `${system.supply.voltageV} V` });
  nodes.push({ id: 'main', kind: 'main-panel', label: mainName });
  edge('bus', 'main');

  // Utility (+ transformer when supplied at MV)
  nodes.push({
    id: 'utility',
    kind: 'utility',
    label: 'PLN utility',
    sub:
      system.supply.type === 'MV'
        ? `${(system.supply.mvVoltageV ?? 20000) / 1000} kV MV`
        : `${system.supply.voltageV} V LV`,
  });
  let utilityOut = 'utility';
  if (system.supply.type === 'MV') {
    nodes.push({ id: 'tx', kind: 'transformer', label: 'Transformer', sub: `${system.supply.transformerKva} kVA` });
    edge('utility', 'tx');
    utilityOut = 'tx';
  }

  // Generator via ATS, with the mains<->genset interlock. With marked
  // essential panels the ATS transfers a dedicated ESSENTIAL BUS (fed from the
  // main bus in normal service); otherwise it transfers the whole building.
  const gen = system.sources?.generator;
  const essentialCount = gen?.essentialPanelCount ?? 0;
  // Where backed loads (battery inverter) connect: the essential bus when split.
  let backedBus = 'bus';
  if (gen) {
    nodes.push({ id: 'gen', kind: 'generator', label: 'Generator', sub: `${gen.ratingKva} kVA ${gen.mode}` });
    nodes.push({ id: 'ats', kind: 'ats', label: 'ATS', sub: 'transfer switch' });
    if (essentialCount > 0) {
      nodes.push({
        id: 'ess-bus',
        kind: 'bus',
        label: 'Essential bus',
        sub: `${essentialCount} panel(s) · ${gen.backupKva} kVA`,
      });
      edge(utilityOut, 'bus', 'mains');
      edge('bus', 'ats', 'normal');
      edge('gen', 'ats', 'genset');
      edge('ats', 'ess-bus');
      backedBus = 'ess-bus';
    } else {
      edge(utilityOut, 'ats', 'mains');
      edge('gen', 'ats', 'genset');
      edge('ats', 'bus');
    }
    interlocks.push({
      id: 'il-ats-mech',
      kind: 'mechanical',
      aId: 'utility',
      bId: 'gen',
      relation: 'mutual_exclusion',
      note: 'Mains and generator must never be paralleled — mechanical interlock at the ATS.',
    });
    interlocks.push({
      id: 'il-ats-elec',
      kind: 'electrical',
      aId: 'utility',
      bId: 'gen',
      relation: 'mutual_exclusion',
      note: 'Cross-wired electrical interlock + break-before-make transfer (mains-failure sensing).',
    });
  } else {
    edge(utilityOut, 'bus', 'mains');
  }

  // Solar PV via inverter (grid-tied), with anti-islanding / hybrid interlock
  const solar = system.sources?.solar;
  if (solar) {
    nodes.push({ id: 'pv', kind: 'pv', label: 'Solar array', sub: `${solar.arrayKwp} kWp` });
    nodes.push({ id: 'pvinv', kind: 'pv-inverter', label: 'PV inverter', sub: `${solar.inverterKw} kW` });
    edge('pv', 'pvinv');
    edge('pvinv', 'bus', 'AC');
    interlocks.push({
      id: 'il-pv',
      kind: 'electrical',
      aId: 'pvinv',
      bId: 'bus',
      relation: 'permissive',
      note: system.sources?.battery
        ? 'Hybrid: PV + battery island the essential bus on grid loss.'
        : 'Anti-islanding: the grid-tied PV inverter disconnects within ~2 s on grid loss.',
    });
    if (gen) {
      interlocks.push({
        id: 'il-pv-gen',
        kind: 'electrical',
        aId: 'pvinv',
        bId: 'gen',
        relation: 'permissive',
        note: 'On generator supply the PV inverter must disconnect or derate — a standby genset cannot absorb reverse PV feed.',
      });
    }
  }

  // Battery via inverter/charger, with transfer/island interlock. With an
  // essential-bus split the battery backs that bus, not the whole building.
  const batt = system.sources?.battery;
  if (batt) {
    nodes.push({ id: 'batt', kind: 'battery', label: 'Battery', sub: `${batt.installedKwh} kWh` });
    nodes.push({ id: 'battinv', kind: 'battery-inverter', label: 'Battery inverter', sub: `${batt.inverterKw} kW` });
    edge('batt', 'battinv');
    edge('battinv', backedBus, 'AC');
    interlocks.push({
      id: 'il-batt',
      kind: 'electrical',
      aId: 'battinv',
      bId: backedBus,
      relation: 'sequence',
      note: 'Battery inverter transfers the essential load on outage (UPS / island mode).',
    });
  }

  return { nodes, edges, interlocks };
}
