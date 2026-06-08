import { describe, it, expect, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
} from '../../src/main/repositories/projects.repo';
import {
  saveSchematic,
  loadSchematic,
  deleteSchematic,
} from '../../src/main/repositories/schematic.repo';
import { createSampleProject } from '@renderer/data/sampleProject';
import { applyStarterTemplate, buildSchematic } from '@shared/engine';

/**
 * Runtime verification of the SQLite/Drizzle persistence layer using the
 * non-Electron working-dir fallback database. Exercises the real bootstrap +
 * repository code paths (the one runtime path that cannot be reached through the
 * headless Electron build).
 */
describe('SQLite persistence', () => {
  afterAll(() => {
    closeDb();
    try {
      rmSync(join(process.cwd(), '.panelmaker'), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('bootstraps the schema, then saves and reloads a project graph', () => {
    expect(migrate()).toBe('bootstrap');

    const project = createSampleProject();
    saveProject(project);

    const loaded = loadProject(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe(project.name);
    expect(loaded!.panels.length).toBe(project.panels.length);

    // motor circuit round-trips its starter + motor fields
    const mcc = loaded!.panels.find((p) => p.name.includes('MCC'))!;
    const starDelta = mcc.circuits.find((c) => c.starterType === 'STAR_DELTA')!;
    expect(starDelta.motorKw).toBe(37);

    // pump circuit round-trips its control mode
    const pump = mcc.circuits.find((c) => c.controlMode === 'fill');
    expect(pump?.starterType).toBe('DOL');

    // feeder links survive
    const main = loaded!.panels.find((p) => p.sourceType === 'utility')!;
    expect(main.circuits.some((c) => c.feedsPanelId)).toBe(true);

    // appears in the project list, then deletes cleanly
    expect(listProjects().some((p) => p.id === project.id)).toBe(true);
    deleteProject(project.id);
    expect(loadProject(project.id)).toBeNull();
  });

  it('saves and reloads a control schematic for a real circuit', () => {
    migrate();
    const project = createSampleProject();
    saveProject(project);

    const mcc = project.panels.find((p) => p.name.includes('MCC'))!;
    const starDelta = mcc.circuits.find((c) => c.starterType === 'STAR_DELTA')!;
    const assembly = applyStarterTemplate({
      circuitId: starDelta.id,
      starterType: 'STAR_DELTA',
      motorKw: starDelta.motorKw!,
    });
    const schematic = buildSchematic(assembly);
    expect(schematic.rungs.length).toBeGreaterThan(0);

    saveSchematic(schematic);
    const loaded = loadSchematic(starDelta.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.rungs.length).toBe(schematic.rungs.length);
    expect(loaded!.symbols.length).toBe(schematic.symbols.length);
    // a coil symbol round-trips its device cross-reference
    const coil = loaded!.symbols.find((s) => s.type === 'coil');
    expect(coil?.deviceRef?.element).toBe('coil');

    deleteSchematic(starDelta.id);
    expect(loadSchematic(starDelta.id)).toBeNull();

    deleteProject(project.id);
  });
});
