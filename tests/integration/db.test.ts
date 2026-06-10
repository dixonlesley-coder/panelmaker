import { describe, it, expect, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, getConnection } from '../../src/main/db/connection';
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
    project.earthingSystem = 'TT';
    project.site = { externalLps: true, overheadSupply: false, soilResistivityOhmM: 150 };
    // Panel tag/occupancy + point-level detail must survive the SQLite round-trip
    // (these were silently dropped by the column-wise mapping before).
    const lp = project.panels.find((p) => p.name.includes('LP-DB'))!;
    lp.tag = 'LP-1';
    lp.occupancy = 'office';
    const lighting = lp.circuits.find((c) => c.loadKind === 'lighting')!;
    lighting.fixtures = [
      { id: 'fx-1', name: 'LED downlight 12 W', wattsPerFitting: 12, qty: 10, switchGroupId: 'sw-1' },
    ];
    lighting.switchGroups = [
      { id: 'sw-1', label: 'SW1', kind: 'smart', protocol: 'zigbee', neutralAtSwitch: true },
    ];
    const socketsCircuit = lp.circuits.find((c) => c.loadKind === 'socket');
    const socketHost = socketsCircuit ?? lp.circuits.find((c) => c.loadKind === 'general')!;
    socketHost.sockets = [
      { id: 'so-1', name: 'Wall east', qty: 4 },
      { id: 'so-2', name: 'Oven', qty: 1, type: 'dedicated', vaPerPoint: 2200 },
    ];
    // Manual overrides must round-trip too.
    lighting.breakerOverrideA = 20;
    lighting.cableOverrideMm2 = 4;
    project.meta = {
      client: 'PT Contoh',
      location: 'Jakarta',
      engineer: 'L. Dixon',
      companyName: 'PanelMaker Co.',
      drawingNumber: 'E-101',
      projectNumber: 'JOB-42',
      revision: 'B',
      logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      revisions: [
        { rev: 'A', date: '2026-01-01', note: 'Issued for review', by: 'LD' },
        { rev: 'B', date: '2026-02-01', note: 'Issued for construction' },
      ],
    };
    saveProject(project);

    const loaded = loadProject(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe(project.name);
    expect(loaded!.earthingSystem).toBe('TT');

    // branding / title-block metadata round-trips via the meta_json column
    expect(loaded!.meta).toEqual(project.meta);
    expect(loaded!.meta?.revisions?.[0]?.rev).toBe('A');
    expect(loaded!.meta?.revisions?.[1]?.by).toBeUndefined();
    expect(loaded!.sources?.generator?.enabled).toBe(true);
    expect(loaded!.sources?.solar?.enabled).toBe(true);
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

    // scheduled loads round-trip
    const lpdb = loaded!.panels.find((p) => p.name.includes('LP-DB'))!;
    const ev = lpdb.circuits.find((c) => c.loadKind === 'ev_charger')!;
    expect(ev.schedule).toEqual({ startHour: 22, endHour: 6 });

    // site conditions round-trip via site_json
    expect(loaded!.site).toEqual({ externalLps: true, overheadSupply: false, soilResistivityOhmM: 150 });

    // panel tag + occupancy round-trip as columns
    expect(lpdb.tag).toBe('LP-1');
    expect(lpdb.occupancy).toBe('office');

    // point-level detail (fixtures / switch groups / sockets) round-trips via points_json
    const loadedLighting = lpdb.circuits.find((c) => c.loadKind === 'lighting')!;
    expect(loadedLighting.fixtures).toEqual(lighting.fixtures);
    expect(loadedLighting.switchGroups).toEqual(lighting.switchGroups);
    expect(loadedLighting.breakerOverrideA).toBe(20);
    expect(loadedLighting.cableOverrideMm2).toBe(4);
    const loadedSocketHost = lpdb.circuits.find((c) => (c.sockets ?? []).length > 0)!;
    expect(loadedSocketHost.sockets).toEqual(socketHost.sockets);
    // a circuit without point detail keeps the fields absent (no empty arrays)
    const plain = lpdb.circuits.find((c) => c.loadKind === 'hvac')!;
    expect(plain.fixtures).toBeUndefined();
    expect(plain.sockets).toBeUndefined();

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

  it('re-adds columns that an older database is missing (legacy upgrade)', () => {
    // A fresh bootstrap creates the full panels table.
    migrate();
    const { sqlite } = getConnection();
    const panelCols = () =>
      (sqlite.prepare('PRAGMA table_info(panels)').all() as { name: string }[]).map((r) => r.name);

    // Simulate a database first created by an EARLIER build, before these
    // columns existed. On a real upgrade `CREATE TABLE IF NOT EXISTS` leaves the
    // existing table untouched, so the columns stay missing — drop them to
    // reproduce that exact starting state.
    sqlite.exec('ALTER TABLE panels DROP COLUMN insulation');
    sqlite.exec('ALTER TABLE panels DROP COLUMN material');
    expect(panelCols()).not.toContain('insulation');
    expect(panelCols()).not.toContain('material');

    // Regression: the column back-fill used to be dead code (defined, never
    // called), so migrate() left those columns missing and projects:load failed
    // with `no such column: "insulation"`. migrate() must now add them back.
    migrate();
    expect(panelCols()).toContain('insulation');
    expect(panelCols()).toContain('material');

    // …and a project carrying those fields round-trips through the repo again.
    const project = createSampleProject();
    const lp = project.panels.find((p) => p.name.includes('LP-DB'))!;
    lp.insulation = 'XLPE';
    lp.material = 'Al';
    saveProject(project);
    const loaded = loadProject(project.id);
    const loadedLp = loaded!.panels.find((p) => p.name.includes('LP-DB'))!;
    expect(loadedLp.insulation).toBe('XLPE');
    expect(loadedLp.material).toBe('Al');
    deleteProject(project.id);
  });
});
