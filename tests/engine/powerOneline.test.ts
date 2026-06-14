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

  it('solar + battery default to ONE hybrid inverter (PV+battery DC, grid AC) feeding the bus', () => {
    const sys = computeSystem(
      projectWith({
        solar: { enabled: true, targetKwp: 30, panelWp: 550, dcAcRatio: 1.2 },
        battery: { enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' },
      }),
    );
    expect(sys.sources?.hybridInverter).toBe(true);
    expect(sys.sources?.hybridInverterKw).toBeGreaterThan(0);

    const ol = computePowerOneline(sys);
    // A single hybrid inverter, no separate per-source inverters.
    expect(ol.nodes.filter((n) => n.kind === 'hybrid-inverter')).toHaveLength(1);
    expect(ol.nodes.some((n) => n.kind === 'pv-inverter')).toBe(false);
    expect(ol.nodes.some((n) => n.kind === 'battery-inverter')).toBe(false);
    // PV and battery couple via DC; the grid couples via AC; the inverter feeds the bus.
    expect(ol.edges.some((e) => e.from === 'pv' && e.to === 'hinv' && e.label === 'DC')).toBe(true);
    expect(ol.edges.some((e) => e.from === 'batt' && e.to === 'hinv' && e.label === 'DC')).toBe(true);
    expect(ol.edges.some((e) => e.from === 'utility' && e.to === 'hinv')).toBe(true);
    expect(ol.edges.some((e) => e.from === 'hinv' && e.to === 'bus' && e.label === 'AC')).toBe(true);
    // The grid no longer feeds the bus directly — everything goes through the inverter.
    expect(ol.edges.some((e) => e.from === 'utility' && e.to === 'bus')).toBe(false);
    expect(ol.interlocks.some((i) => i.id === 'il-hybrid')).toBe(true);
  });

  it('hybridInverter:false forces separate per-source inverters with their own interlocks', () => {
    const ol = computePowerOneline(
      computeSystem(
        projectWith({
          hybridInverter: false,
          solar: { enabled: true, targetKwp: 30, panelWp: 550, dcAcRatio: 1.2 },
          battery: { enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' },
        }),
      ),
    );
    expect(ol.nodes.some((n) => n.kind === 'hybrid-inverter')).toBe(false);
    expect(ol.nodes.some((n) => n.kind === 'pv-inverter')).toBe(true);
    expect(ol.nodes.some((n) => n.kind === 'battery-inverter')).toBe(true);
    expect(ol.interlocks.some((i) => i.id === 'il-pv')).toBe(true);
    expect(ol.interlocks.some((i) => i.id === 'il-batt')).toBe(true);
    expect(ol.interlocks.find((i) => i.id === 'il-pv')?.note).toContain('Hybrid');
  });

  it('solar-only keeps its own grid-tied inverter (no hybrid without a battery)', () => {
    const sys = computeSystem(
      projectWith({ solar: { enabled: true, targetKwp: 30, panelWp: 550, dcAcRatio: 1.2 } }),
    );
    expect(sys.sources?.hybridInverter).toBeUndefined();
    const ol = computePowerOneline(sys);
    expect(ol.nodes.some((n) => n.kind === 'pv-inverter')).toBe(true);
    expect(ol.nodes.some((n) => n.kind === 'hybrid-inverter')).toBe(false);
  });

  it('MV supply inserts a transformer', () => {
    const sys = computeSystem(projectWith(undefined, 250000));
    expect(sys.supply.type).toBe('MV');
    const ol = computePowerOneline(sys);
    expect(ol.nodes.some((n) => n.kind === 'transformer')).toBe(true);
  });
});
