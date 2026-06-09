import { useEffect, useState } from 'react';
import { useProjectStore } from '@renderer/state/projectStore';
import {
  autosaveTarget,
  flushProjectSync,
  loadPersistedProject,
  persistProject,
  type AutosaveTarget,
} from '@renderer/lib/autosave';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Debounce window — a crash loses at most this much recent editing. */
const DEBOUNCE_MS = 1200;

/**
 * Restores the last project on mount, then autosaves on a debounce after every
 * change. Autosave only starts once hydration completes, so the freshly-loaded
 * project is never overwritten by the seeded sample during the load race.
 */
export function useAutosave(): { hydrated: boolean; saveState: SaveState; target: AutosaveTarget } {
  const project = useProjectStore((s) => s.project);
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // restore once on mount
  useEffect(() => {
    let cancelled = false;
    loadPersistedProject()
      .then((p) => {
        if (!cancelled && p) replaceProject(p);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [replaceProject]);

  // debounced autosave after hydration
  useEffect(() => {
    if (!hydrated) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      persistProject(project)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [project, hydrated]);

  // best-effort flush on tab/window close (web)
  useEffect(() => {
    const handler = () => flushProjectSync(useProjectStore.getState().project);
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return { hydrated, saveState, target: autosaveTarget() };
}
