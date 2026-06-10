import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv } from '@shared/io/csv';
import { parseLoadList } from '@shared/io/loadListImport';
import { cableScheduleCsv, panelScheduleCsv } from '@shared/io/scheduleExport';
import { computeSystem } from '@shared/engine';
import type { ProjectInput } from '@shared/types';

describe('csv parse/stringify (RFC 4180)', () => {
  it('round-trips a grid containing commas, quotes and newlines', () => {
    const grid = [
      ['name', 'note', 'qty'],
      ['Pump, main', 'he said "go"', '3'],
      ['multi\nline', 'plain', '0'],
    ];
    const csv = toCsv(grid);
    // Fields needing quoting are quoted; lines end with CRLF.
    expect(csv).toContain('"Pump, main"');
    expect(csv).toContain('"he said ""go"""');
    expect(csv).toContain('"multi\nline"');
    expect(csv.endsWith('\r\n')).toBe(true);

    const back = parseCsv(csv);
    expect(back).toEqual(grid);
  });

  it('parses CRLF line endings and a trailing newline without a spurious row', () => {
    const rows = parseCsv('a,b\r\nc,d\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('returns no rows for an empty string', () => {
    expect(parseCsv('')).toEqual([]);
    expect(toCsv([])).toBe('');
  });

  it('stringifies numbers and quotes only when needed', () => {
    const csv = toCsv([['plain', 42, 'has,comma']]);
    expect(csv).toBe('plain,42,"has,comma"\r\n');
  });
});

describe('parseLoadList', () => {
  const csv = [
    'Panel,Circuit,kW,LoadKind,Length,CosPhi',
    'MDB,Lighting,2,lighting,25,0.95',
    'MDB,Sockets,3.5,socket,30,',
    'Pump House,Booster,,pump,40,0.85',
  ].join('\n');

  it('groups rows into panels with kW→W conversion and defaults', () => {
    const { panels, warnings } = parseLoadList(csv);
    expect(panels).toHaveLength(2);

    const mdb = panels.find((p) => p.name === 'MDB')!;
    expect(mdb).toBeDefined();
    expect(mdb.system).toBe('3ph');
    expect(mdb.voltageV).toBe(400);
    expect(mdb.sourceType).toBe('utility');
    expect(mdb.circuits).toHaveLength(2);

    const lighting = mdb.circuits[0]!;
    expect(lighting.name).toBe('Lighting');
    expect(lighting.loadW).toBe(2000); // 2 kW → 2000 W
    expect(lighting.loadKind).toBe('lighting');
    expect(lighting.isLighting).toBe(true);
    expect(lighting.cosPhi).toBe(0.95);
    expect(lighting.lengthM).toBe(25);

    const sockets = mdb.circuits[1]!;
    expect(sockets.loadW).toBe(3500);
    expect(sockets.cosPhi).toBe(0.85); // blank cosPhi → default

    const pumpPanel = panels.find((p) => p.name === 'Pump House')!;
    expect(pumpPanel.circuits).toHaveLength(1);

    // Stable, distinct ids.
    expect(panels.map((p) => p.id)).toEqual(['panel-1', 'panel-2']);
    expect(mdb.circuits.map((c) => c.id)).toEqual(['c-1', 'c-2']);

    // The Booster row has no load (blank kW, no watts/motorKw) → a warning.
    expect(warnings.some((w) => /Booster/.test(w) && /no load/i.test(w))).toBe(true);
  });

  it('warns and falls back to general on an unknown loadKind', () => {
    const bad = ['Panel,Circuit,kW,LoadKind', 'P1,Mystery,1,plasma'].join('\n');
    const { panels, warnings } = parseLoadList(bad);
    const c = panels[0]!.circuits[0]!;
    expect(c.loadKind).toBe('general');
    expect(warnings.some((w) => /unknown loadKind/i.test(w) && /plasma/.test(w))).toBe(true);
  });
});

describe('scheduleExport', () => {
  it('cableScheduleCsv emits a header plus one row per circuit', () => {
    const { panels } = parseLoadList(
      ['Panel,Circuit,kW,LoadKind', 'MDB,Lighting,4,lighting', 'MDB,AC,6,hvac'].join('\n'),
    );
    const project: ProjectInput = { id: 'PRJ', name: 'Imported', panels };
    const system = computeSystem(project);

    const csv = cableScheduleCsv(system);
    const rows = parseCsv(csv);

    expect(rows[0]).toContain('Panel');
    expect(rows[0]).toContain('Tag');
    expect(rows[0]).toContain('Cumulative Vd %');

    const circuitCount = Object.values(system.panels).reduce((n, p) => n + p.circuits.length, 0);
    expect(rows.length).toBe(circuitCount + 1); // header + one row per circuit
    expect(circuitCount).toBe(2);

    // Spot-check a data cell carries the circuit name (column 2, after Panel + Tag).
    expect(rows.slice(1).some((r) => r[2] === 'Lighting')).toBe(true);

    // panelScheduleCsv for the same panel matches its circuit count + header.
    const panelId = Object.keys(system.panels)[0]!;
    const panelRows = parseCsv(panelScheduleCsv(system, panelId));
    expect(panelRows.length).toBe(system.panels[panelId]!.circuits.length + 1);
  });

  it('panelScheduleCsv returns just the header for an unknown panel', () => {
    const system = computeSystem({ id: 'X', name: 'X', panels: [] });
    const rows = parseCsv(panelScheduleCsv(system, 'nope'));
    expect(rows.length).toBe(1);
    expect(rows[0]![0]).toBe('Panel');
  });
});
