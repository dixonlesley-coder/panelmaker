import { describe, it, expect } from 'vitest';
import { computeSystem, costSystemConsolidated } from '@shared/engine';
import { CATALOG_PARTS } from '@shared/data/catalog';
import { buildDeliverables, safeStem } from '@renderer/lib/deliverables';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 2000,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function panel(partial: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

const project: ProjectInput = {
  id: 'prj',
  name: 'Test: Building/A',
  panels: [
    panel({ id: 'mdp', name: 'MDP', tag: 'MDP', circuits: [branch({ id: 'c1', name: 'Sockets' })] }),
    panel({ id: 'lp1', name: 'Lighting', circuits: [branch({ id: 'c2', name: 'Lights', isLighting: true, loadKind: 'lighting' })] }),
  ],
};

describe('buildDeliverables', () => {
  const system = computeSystem(project);
  const bom = costSystemConsolidated(system, [...CATALOG_PARTS], new Map());
  const files = buildDeliverables(project, system, bom);

  it('emits BOM + cable schedule + an SLD and GA DXF per panel', () => {
    expect(files[0]!.filename).toBe('Test- Building-A - BOM.xlsx');
    expect(files[1]!.filename).toBe('Test- Building-A - cable schedule.csv');
    // Panel drawings follow the system's root-first order — assert as a set.
    expect(new Set(files.slice(2).map((f) => f.filename))).toEqual(
      new Set([
        'MDP — MDP - SLD.dxf',
        'MDP — MDP - GA.dxf',
        'Lighting - SLD.dxf',
        'Lighting - GA.dxf',
      ]),
    );
  });

  it('builds the BOM workbook as non-empty xlsx bytes', () => {
    const bomFile = files[0]!;
    expect(bomFile.data).toBeInstanceOf(Uint8Array);
    expect((bomFile.data as Uint8Array).byteLength).toBeGreaterThan(0);
    // XLSX containers are ZIP files: PK magic.
    const bytes = bomFile.data as Uint8Array;
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('builds the cable schedule as a BOM-prefixed CSV with every circuit', () => {
    const csv = files[1]!.data as string;
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Panel,Tag,Circuit');
    expect(csv).toContain('Sockets');
    expect(csv).toContain('Lights');
  });

  it('builds DXF documents for every panel drawing', () => {
    for (const f of files.slice(2)) {
      expect(typeof f.data).toBe('string');
      expect(f.data as string).toContain('SECTION');
      expect(f.data as string).toContain('ENTITIES');
    }
  });
});

describe('safeStem', () => {
  it('replaces filesystem-hostile characters and never returns empty', () => {
    expect(safeStem('a/b\\c:d')).toBe('a-b-c-d');
    expect(safeStem('  ')).toBe('project');
  });
});
