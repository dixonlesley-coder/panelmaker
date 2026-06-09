import { describe, it, expect, beforeEach } from 'vitest';
import { persistProject, loadPersistedProject, autosaveTarget } from '@renderer/lib/autosave';
import { createSampleProject } from '@renderer/data/sampleProject';

// Present a minimal browser-like global so the api bridge takes the web path
// (window defined, but no window.api) and has a localStorage to write to.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  } as Storage;
});

describe('autosave (web / localStorage)', () => {
  it('reports the local target when no desktop api is present', () => {
    expect(autosaveTarget()).toBe('local');
  });

  it('round-trips the project through localStorage', async () => {
    const project = createSampleProject();
    await persistProject(project);
    const loaded = await loadPersistedProject();
    expect(loaded?.id).toBe(project.id);
    expect(loaded?.name).toBe(project.name);
    expect(loaded?.panels.length).toBe(project.panels.length);
    // a scheduled load survives the JSON round-trip
    const ev = loaded?.panels
      .flatMap((p) => p.circuits)
      .find((c) => c.loadKind === 'ev_charger');
    expect(ev?.schedule).toEqual({ startHour: 22, endHour: 6 });
  });

  it('returns null when nothing has been saved', async () => {
    expect(await loadPersistedProject()).toBeNull();
  });
});
