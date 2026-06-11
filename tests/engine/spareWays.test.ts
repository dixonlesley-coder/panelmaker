import { describe, it, expect } from 'vitest';
import { computePanel } from '@shared/engine';
import { buildPanelBom, circuitOrderCodes } from '@shared/engine/bom';
import { cableScheduleCsv } from '@shared/io/scheduleExport';
import { CATALOG_PARTS } from '@shared/data/catalog';
import type { CircuitInput, PanelInput, Part } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function spare(id: string, name: string): CircuitInput {
  return branch({ id, name, loadKind: 'spare', loadW: 0, demandFactor: 0, lengthM: 1, cosPhi: 1 });
}

const p: PanelInput = {
  id: 'P1',
  name: 'DB with spares',
  system: '3ph',
  voltageV: 400,
  ambientTempC: 30,
  installMethod: 'conduit',
  groupingCount: 1,
  diversityFactor: 1,
  sourceType: 'utility',
  circuits: [
    branch({ id: 'c1', name: 'Sockets', loadW: 3000, loadKind: 'socket' }),
    spare('s1', 'Spare 1'),
    spare('s2', 'Spare 2'),
  ],
};

describe('spare ways', () => {
  const r = computePanel(p);
  const spareRes = r.circuits.find((c) => c.circuitId === 's1')!;

  it('contributes a way and a breaker but zero demand', () => {
    expect(r.circuits).toHaveLength(3);
    expect(spareRes.loadKind).toBe('spare');
    expect(spareRes.designCurrentA).toBe(0);
    expect(spareRes.breaker.ratingA).toBeGreaterThan(0);
    // Demand equals the socket circuit alone — spares add nothing.
    const noSpares = computePanel({ ...p, circuits: [p.circuits[0]!] });
    expect(r.totalDemandCurrentA).toBe(noSpares.totalDemandCurrentA);
    // But the board grows: spares occupy modules in the enclosure.
    expect(r.enclosure.modules).toBeGreaterThan(noSpares.enclosure.modules);
  });

  it('needs no RCD (even on TT) and no conduit', () => {
    const tt = computePanel(p, { earthingSystem: 'TT' });
    const s = tt.circuits.find((c) => c.circuitId === 's1')!;
    const socket = tt.circuits.find((c) => c.circuitId === 'c1')!;
    expect(s.rcd.required).toBe(false);
    expect(socket.rcd.required).toBe(true); // TT final circuit keeps its RCD
    expect(s.containment).toBeUndefined();
  });

  it('reports spare counts and a stable recommendation', () => {
    expect(r.spare?.spareWaysPresent).toBe(2);
    const rec = r.spare!.recommendedSpareWays;
    // Adding more spares must not raise the recommendation (it is based on
    // active modules only) — the one-click "add N" therefore converges.
    const more = computePanel({ ...p, circuits: [...p.circuits, spare('s3', 'Spare 3')] });
    expect(more.spare!.recommendedSpareWays).toBe(rec);
    expect(more.spare!.spareWaysPresent).toBe(3);
  });

  it('BOM prices the spare breaker but no cable; order codes skip the cable', () => {
    const parts: Part[] = [...CATALOG_PARTS];
    const lines = buildPanelBom(r, parts);
    const spareLines = lines.filter((l) => l.description.includes('Spare 1'));
    expect(spareLines.some((l) => l.category === 'breaker')).toBe(true);
    expect(spareLines.some((l) => l.category === 'cable')).toBe(false);
    const codes = circuitOrderCodes(spareRes, parts);
    expect(codes.breaker).toBeDefined();
    expect(codes.cable).toBeUndefined();
  });

  it('cable schedule marks spares as SPARE with no cable data', () => {
    const csv = cableScheduleCsv({
      panels: { [p.id]: r },
      order: [p.id],
    } as never);
    const spareRow = csv.split('\r\n').find((row) => row.includes('Spare 1'))!;
    expect(spareRow).toContain('SPARE');
    expect(spareRow).not.toContain('mm²');
  });
});
