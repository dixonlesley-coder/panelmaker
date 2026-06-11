/** Pure helpers over the project's panel feeder tree (no DOM/store deps). */

import type { ProjectInput, SystemResult } from '@shared/types';

/**
 * Names of the sub-panels fed by feeders of the given panels — the panels that
 * would be orphaned (disconnected, back to standalone roots) if those panels
 * were deleted. A sub-panel that is itself in `panelIds` (multi-select delete)
 * is not reported: it is going away too, not being orphaned.
 */
export function fedSubPanelNames(project: ProjectInput, panelIds: readonly string[]): string[] {
  const deleting = new Set(panelIds);
  const fedIds = new Set<string>();
  for (const p of project.panels) {
    if (!deleting.has(p.id)) continue;
    for (const c of p.circuits) {
      if (c.feedsPanelId && !deleting.has(c.feedsPanelId)) fedIds.add(c.feedsPanelId);
    }
  }
  return project.panels.filter((p) => fedIds.has(p.id)).map((p) => p.name);
}

/**
 * The panel that IS the building's PLN service entrance: a real installation
 * has one intake, but the model reuses `sourceType: 'utility'` for every
 * standalone root (a new panel is a root until it's fed). Among utility roots,
 * prefer the one actually feeding sub-panels (it's the MDP), then the highest
 * demand, then the first — so the drawing hangs the grid intake, meter and
 * supply gear on one panel and the rest read as "not connected yet".
 */
export function serviceRootId(project: ProjectInput, system: SystemResult): string | undefined {
  const roots = project.panels.filter((p) => p.sourceType === 'utility' && system.panels[p.id]);
  if (roots.length <= 1) return roots[0]?.id;
  let best = roots[0]!;
  let bestScore = score(best);
  for (const p of roots.slice(1)) {
    const s = score(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best.id;

  function score(p: (typeof roots)[number]): number {
    const feedsChildren = p.circuits.some((c) => c.feedsPanelId !== undefined) ? 1 : 0;
    const demandA = system.panels[p.id]?.totalDemandCurrentA ?? 0;
    // Children dominate; demand breaks ties; array order breaks the rest (stable).
    return feedsChildren * 1e9 + demandA;
  }
}
