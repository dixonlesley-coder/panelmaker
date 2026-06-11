/** Pure helpers over the project's panel feeder tree (no DOM/store deps). */

import type { ProjectInput } from '@shared/types';

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
