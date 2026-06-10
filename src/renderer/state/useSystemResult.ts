import { useMemo } from 'react';
import { computeSystem } from '@shared/engine';
import type { SystemResult } from '@shared/types';
import type { ProjectInput } from '@shared/types';
import { useProjectStore } from './projectStore';

/**
 * Cross-screen cache of the computed system, keyed by project identity. The
 * store updates immutably, so a given `ProjectInput` reference always maps to
 * the same result — navigating between screens (each previously running its own
 * `useMemo(() => computeSystem(project))`) no longer re-runs the whole engine
 * for an unchanged project, and new screens get memoization for free.
 */
const cache = new WeakMap<ProjectInput, SystemResult>();

/** Compute (or reuse) the system result for an arbitrary project reference. */
export function systemResultFor(project: ProjectInput): SystemResult {
  let result = cache.get(project);
  if (!result) {
    result = computeSystem(project);
    cache.set(project, result);
  }
  return result;
}

/** The computed system for the working project (cached across screens). */
export function useSystemResult(): SystemResult {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => systemResultFor(project), [project]);
}
