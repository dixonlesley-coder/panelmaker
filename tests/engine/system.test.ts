import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem } from '@shared/engine';
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
    expect(c.designCurrentA).toBeCloseTo(102, 0);
    expect(c.control?.starterType).toBe('STAR_DELTA');
    expect(c.control?.devices.some((d) => d.category === 'control_transformer')).toBe(true);
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
});
