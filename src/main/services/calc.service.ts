/**
 * Calculation service — a thin boundary over the pure engine so IPC handlers
 * depend on this rather than on `@shared/engine` directly.
 */

import type { ProjectInput } from '@shared/types/project';
import type { SystemResult, PanelResult } from '@shared/types/results';
import { computeSystem } from '@shared/engine';

/** Compute the whole project (system) result. */
export function computeProject(project: ProjectInput): SystemResult {
  return computeSystem(project);
}

/** Compute a single panel's result by recomputing the system and selecting it. */
export function computePanelResult(
  project: ProjectInput,
  panelId: string,
): PanelResult | undefined {
  const system = computeSystem(project);
  return system.panels[panelId];
}
