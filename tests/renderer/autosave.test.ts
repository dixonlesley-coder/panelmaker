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
    const res = await loadPersistedProject();
    expect(res.ok).toBe(true);
    const loaded = res.ok ? res.project : null;
    expect(loaded?.id).toBe(project.id);
    expect(loaded?.name).toBe(project.name);
    expect(loaded?.panels.length).toBe(project.panels.length);
    // a scheduled load survives the JSON round-trip
    const ev = loaded?.panels
      .flatMap((p) => p.circuits)
      .find((c) => c.loadKind === 'ev_charger');
    expect(ev?.schedule).toEqual({ startHour: 22, endHour: 6 });
  });

  it('reports a clean first launch as ok with no project', async () => {
    expect(await loadPersistedProject()).toEqual({ ok: true, project: null });
  });

  it('self-heals a corrupted web snapshot (unrecoverable → clean start)', async () => {
    localStorage.setItem('panelmaker:project', '{not json');
    expect(await loadPersistedProject()).toEqual({ ok: true, project: null });
  });
});
