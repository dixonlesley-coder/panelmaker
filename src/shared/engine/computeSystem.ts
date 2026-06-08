import type { ProjectInput } from '../types/project';
import type { PanelResult, SystemResult, Warning } from '../types/results';
import { computePanel } from './computePanel';
import { determineSupply } from './transformer';
import { computeSources } from './sources';

/**
 * Compute a whole project (building) by walking the panel feeder tree
 * bottom-up: each sub-panel's diversified demand is fed into its parent's feeder
 * circuit, which is then sized from that aggregated load. Rejects feeder cycles.
 */
export function computeSystem(project: ProjectInput): SystemResult {
  const panels = project.panels;
  const byId = new Map(panels.map((p) => [p.id, p]));
  const warnings: Warning[] = [];

  // child panel id -> parent panel id (the panel containing its feeder circuit)
  const parentOf = new Map<string, string>();
  for (const p of panels) {
    for (const c of p.circuits) {
      if (c.feedsPanelId) parentOf.set(c.feedsPanelId, p.id);
    }
  }

  // Post-order DFS from roots so children are computed before parents.
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const postOrder: string[] = [];
  let cycle = false;

  const childrenOf = (id: string) => panels.filter((p) => parentOf.get(p.id) === id);

  const dfs = (id: string): void => {
    if (inStack.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    inStack.add(id);
    for (const child of childrenOf(id)) dfs(child.id);
    inStack.delete(id);
    visited.add(id);
    postOrder.push(id);
  };

  const roots = panels.filter((p) => !parentOf.has(p.id));
  for (const r of roots) dfs(r.id);

  // Anything unreached is inside a cycle (no valid root).
  for (const p of panels) {
    if (!visited.has(p.id)) {
      cycle = true;
      postOrder.push(p.id);
      visited.add(p.id);
    }
  }
  if (cycle) {
    warnings.push({
      code: 'feeder-cycle',
      severity: 'error',
      message: 'Feeder topology contains a cycle; system aggregation may be incomplete.',
    });
  }

  const results: Record<string, PanelResult> = {};
  const panelDemandW = new Map<string, number>(); // child panel id -> demand pushed upstream

  for (const id of postOrder) {
    const panel = byId.get(id);
    if (!panel) continue;
    const feederLoadW: Record<string, number> = {};
    for (const c of panel.circuits) {
      if (c.feedsPanelId) feederLoadW[c.feedsPanelId] = panelDemandW.get(c.feedsPanelId) ?? 0;
    }
    const pr = computePanel(panel, { feederLoadW });
    results[id] = pr;
    panelDemandW.set(id, pr.totalConnectedLoadW * panel.diversityFactor);
    pr.warnings.forEach((w) => warnings.push(w));
  }

  const connectedLoadW = Object.values(results).reduce((s, r) => s + r.totalConnectedLoadW, 0);

  // Determine the supply (LV direct vs MV + transformer) from the diversified
  // demand presented by the root panel(s). kVA = kW / power-factor.
  const BUILDING_PF = 0.85;
  const rootDemandW = roots.reduce((s, p) => s + (panelDemandW.get(p.id) ?? 0), 0);
  const lvVoltageV = roots[0]?.voltageV ?? 400;
  const totalDemandKva = rootDemandW / 1000 / BUILDING_PF;
  const supply = determineSupply(totalDemandKva, lvVoltageV);
  const sources = computeSources(project.sources, totalDemandKva);

  return {
    projectId: project.id,
    panels: results,
    order: [...postOrder].reverse(), // root-first
    supply,
    ...(sources ? { sources } : {}),
    totals: { connectedLoadW: Math.round(connectedLoadW), panelCount: panels.length },
    warnings,
  };
}
