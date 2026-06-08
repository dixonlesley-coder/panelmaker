import { describe, it, expect } from 'vitest';
import { computeSystem, computePowerOneline } from '@shared/engine';
import type { ProjectInput, SourcesConfig } from '@shared/types';

function projectWith(sources: SourcesConfig | undefined, loadW = 50000): ProjectInput {
  return {
    id: 'P',
    name: 'B',
    ...(sources ? { sources } : {}),
    panels: [
      {
        id: 'MAIN',
        name: 'MDP',
        system: '3ph',
        voltageV: 400,
        ambientTempC: 30,
        installMethod: 'conduit',
        groupingCount: 1,
        diversityFactor: 0.9,
        sourceType: 'utility',
        circuits: [
          {
            id: 'l1',
            name: 'Load',
            role: 'branch',
            loadW,
            cosPhi: 0.85,
            lengthM: 20,
            loadKind: 'general',
            isLighting: false,
            demandFactor: 1,
          },
        ],
      },
    ],
  };
}

describe('computePowerOneline', () => {
  it('utility-only: mains direct to bus, no ATS or interlocks', () => {
    const ol = computePowerOneline(computeSystem(projectWith(undefined)));
    expect(ol.nodes.some((n) => n.kind === 'utility')).toBe(true);
    expect(ol.nodes.some((n) => n.kind === 'ats')).toBe(false);
    expect(ol.interlocks).toHaveLength(0);
    expect(ol.edges.some((e) => e.from === 'utility' && e.to === 'bus')).toBe(true);
  });

  it('generator adds an ATS with mains<->genset mechanical + electrical interlocks', () => {
    const ol = computePowerOneline(
      computeSystem(projectWith({ generator: { enabled: true, backupFraction: 1, mode: 'standby' } })),
    );
    expect(ol.nodes.some((n) => n.kind === 'generator')).toBe(true);
    expect(ol.nodes.some((n) => n.kind === 'ats')).toBe(true);
    const ats = ol.interlocks.filter((i) => i.aId === 'utility' && i.bId === 'gen');
    expect(ats.map((i) => i.kind).sort()).toEqual(['electrical', 'mechanical']);
    expect(ats.every((i) => i.relation === 'mutual_exclusion')).toBe(true);
  });

  it('solar + battery add inverters and their interlocks (hybrid note)', () => {
    const ol = computePowerOneline(
      computeSystem(
        projectWith({
          solar: { enabled: true, targetKwp: 30, panelWp: 550, dcAcRatio: 1.2 },
          battery: { enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' },
        }),
      ),
    );
    expect(ol.nodes.some((n) => n.kind === 'pv-inverter')).toBe(true);
    expect(ol.nodes.some((n) => n.kind === 'battery-inverter')).toBe(true);
    expect(ol.interlocks.some((i) => i.id === 'il-pv')).toBe(true);
    expect(ol.interlocks.some((i) => i.id === 'il-batt')).toBe(true);
    expect(ol.interlocks.find((i) => i.id === 'il-pv')?.note).toContain('Hybrid');
  });

  it('MV supply inserts a transformer', () => {
    const sys = computeSystem(projectWith(undefined, 250000));
    expect(sys.supply.type).toBe('MV');
    const ol = computePowerOneline(sys);
    expect(ol.nodes.some((n) => n.kind === 'transformer')).toBe(true);
  });
});
