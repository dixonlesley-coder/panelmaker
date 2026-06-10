import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem } from '@shared/engine';
import { panelLabel } from '@shared/labels';
import { cableScheduleCsv } from '@shared/io/scheduleExport';
import type { PanelInput, ProjectInput, CircuitInput } from '@shared/types';

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

function panel(partial: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

describe('computePanel', () => {
  it('computes circuits, busbar and enclosure for a simple panel', () => {
    const p = panel({
      id: 'P1',
      name: 'Lighting DB',
      circuits: [
        branch({ id: 'c1', name: 'Lighting 1', loadW: 2000, loadKind: 'lighting', isLighting: true }),
        branch({ id: 'c2', name: 'Sockets', loadW: 3000 }),
      ],
    });
    const r = computePanel(p);
    expect(r.circuits).toHaveLength(2);
    expect(r.totalConnectedLoadW).toBe(5000);
    expect(r.busbar.ampacityA).toBeGreaterThan(0);
    expect(r.enclosure.widthMm).toBeGreaterThan(0);
    expect(r.standardsVersion).toMatch(/PUIL/);
  });

  it('sizes a motor branch with a star-delta starter', () => {
    const p = panel({
      id: 'P2',
      name: 'MCC',
      circuits: [
        branch({
          id: 'm1',
          name: 'Pump motor',
          loadKind: 'motor',
          motorKw: 37,
          starterType: 'STAR_DELTA',
        }),
      ],
    });
    const r = computePanel(p);
    const c = r.circuits[0]!;
    expect(c.designCurrentA).toBeCloseTo(68, 0);
    expect(c.control?.starterType).toBe('STAR_DELTA');
    expect(c.control?.devices.some((d) => d.category === 'control_transformer')).toBe(true);
  });
});

describe('panel tag / designation', () => {
  it('formats the panel label as "TAG — Name" (or just the name when untagged)', () => {
    expect(panelLabel({ tag: 'LP-1', name: 'Lighting' })).toBe('LP-1 — Lighting');
    expect(panelLabel({ name: 'Lighting' })).toBe('Lighting');
    expect(panelLabel({ tag: '   ', name: 'Lighting' })).toBe('Lighting'); // blank tag ignored
  });

  it('carries the tag onto the result and into the cable schedule', () => {
    const project: ProjectInput = {
      id: 'TG',
      name: 'Tagged',
      panels: [
        panel({
          id: 'P1',
          name: 'Ground floor',
          tag: 'LP-1',
          circuits: [branch({ id: 'c1', name: 'Lights', loadW: 2000, loadKind: 'lighting', isLighting: true })],
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.panels['P1']!.tag).toBe('LP-1');

    const header = cableScheduleCsv(sys).split('\r\n')[0]!;
    expect(header.split(',')).toEqual([
      'Panel',
      'Tag',
      'Circuit',
      'Design A',
      'Phase',
      'Breaker A',
      'Cable mm²',
      'Cores',
      'Cable spec',
      'Vd %',
      'Cumulative Vd %',
    ]);
    // The data row carries the tag in the second column.
    const firstData = cableScheduleCsv(sys).split('\r\n')[1]!;
    expect(firstData.split(',')[1]).toBe('LP-1');
  });
});

describe('computeSystem (building tree aggregation)', () => {
  it('aggregates a sub-panel demand onto the parent feeder', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'Building',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main Panel',
          circuits: [
            branch({
              id: 'feeder1',
              name: 'Feeder to SDB',
              loadKind: 'feeder',
              feedsPanelId: 'SDB',
            }),
          ],
        }),
        panel({
          id: 'SDB',
          name: 'Sub DB',
          sourceType: 'feeder',
          fedByCircuitId: 'feeder1',
          circuits: [
            branch({ id: 's1', name: 'Load A', loadW: 10000 }),
            branch({ id: 's2', name: 'Load B', loadW: 10000 }),
          ],
        }),
      ],
    };

    const r = computeSystem(project);
    expect(r.totals.panelCount).toBe(2);
    // root-first order: MAIN before SDB
    expect(r.order[0]).toBe('MAIN');

    const sdbConnected = r.panels['SDB']!.totalConnectedLoadW;
    expect(sdbConnected).toBe(20000);

    // the parent feeder current reflects the diversified sub-panel demand (20000 * 0.8)
    const feeder = r.panels['MAIN']!.circuits.find((c) => c.circuitId === 'feeder1')!;
    const expectedA = (20000 * 0.8) / (Math.sqrt(3) * 400 * 0.85);
    expect(feeder.designCurrentA).toBeCloseTo(expectedA, 0);
  });

  it('aggregates a motor sub-panel load onto the parent feeder (motorKw counted)', () => {
    const project: ProjectInput = {
      id: 'PRJ-M',
      name: 'Motors',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [branch({ id: 'f', name: 'Feeder → MCC', loadKind: 'feeder', feedsPanelId: 'MCC' })],
        }),
        panel({
          id: 'MCC',
          name: 'MCC',
          sourceType: 'feeder',
          fedByCircuitId: 'f',
          circuits: [
            branch({ id: 'm', name: 'Motor', loadKind: 'motor', motorKw: 37, starterType: 'STAR_DELTA' }),
          ],
        }),
      ],
    };
    const r = computeSystem(project);
    // the feeder carries the motor demand, not ~0 A
    const feeder = r.panels['MAIN']!.circuits.find((c) => c.circuitId === 'f')!;
    expect(feeder.designCurrentA).toBeGreaterThan(40);
    // connected load counts the motor and is not double-counted across the feeder
    expect(r.totals.connectedLoadW).toBe(37000);
  });

  it('detects a feeder cycle', () => {
    const project: ProjectInput = {
      id: 'PRJ2',
      name: 'Bad',
      panels: [
        panel({
          id: 'A',
          name: 'A',
          circuits: [branch({ id: 'fa', name: 'A->B', loadKind: 'feeder', feedsPanelId: 'B' })],
        }),
        panel({
          id: 'B',
          name: 'B',
          circuits: [branch({ id: 'fb', name: 'B->A', loadKind: 'feeder', feedsPanelId: 'A' })],
        }),
      ],
    };
    const r = computeSystem(project);
    expect(r.warnings.some((w) => w.code === 'feeder-cycle')).toBe(true);
  });

  it('accumulates voltage drop from the origin down the feeder tree', () => {
    const project: ProjectInput = {
      id: 'VD',
      name: 'Deep tree',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [branch({ id: 'f1', name: 'F1', loadKind: 'feeder', feedsPanelId: 'SDB', lengthM: 120 })],
        }),
        panel({
          id: 'SDB',
          name: 'SDB',
          sourceType: 'feeder',
          fedByCircuitId: 'f1',
          circuits: [branch({ id: 'f2', name: 'F2', loadKind: 'feeder', feedsPanelId: 'SSDB', lengthM: 120 })],
        }),
        panel({
          id: 'SSDB',
          name: 'SSDB',
          sourceType: 'feeder',
          fedByCircuitId: 'f2',
          circuits: [branch({ id: 'b', name: 'Far load', loadW: 8000, lengthM: 80 })],
        }),
      ],
    };
    const r = computeSystem(project);
    const f1 = r.panels['MAIN']!.circuits.find((c) => c.circuitId === 'f1')!;
    const f2 = r.panels['SDB']!.circuits.find((c) => c.circuitId === 'f2')!;
    const b = r.panels['SSDB']!.circuits.find((c) => c.circuitId === 'b')!;

    expect(b.cumulativeDropPercent).toBeDefined();
    // Cumulative ≈ each upstream feeder segment + the branch's own run.
    const expected = f1.voltageDrop.dropPercent + f2.voltageDrop.dropPercent + b.voltageDrop.dropPercent;
    expect(b.cumulativeDropPercent!).toBeCloseTo(expected, 1);
    // Strictly larger than its own segment (there IS upstream drop).
    expect(b.cumulativeDropPercent!).toBeGreaterThan(b.voltageDrop.dropPercent);
    // When the origin-to-load total breaches the limit, it is flagged.
    if (b.cumulativeDropPercent! > b.voltageDrop.limitPercent + 1e-9) {
      expect(
        r.warnings.some((w) => w.code === 'cumulative-voltage-drop-exceeded' && w.circuitId === 'b'),
      ).toBe(true);
    }
  });
});
