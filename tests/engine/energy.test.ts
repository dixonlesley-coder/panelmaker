import { describe, it, expect } from 'vitest';
import { computeSystem } from '@shared/engine';
import { computeEnergyEconomics } from '@shared/engine/energy';
import { conductorResistanceOhmPerKm } from '@shared/standards/conductors';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

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

/** A small single-phase project with one branch circuit of known length/load. */
function singlePhaseProject(extra?: Partial<ProjectInput>): ProjectInput {
  return {
    id: 'PRJ',
    name: 'Small shop',
    panels: [
      panel({
        id: 'P1',
        name: 'DB',
        system: '1ph',
        voltageV: 220,
        circuits: [branch({ id: 'c1', name: 'Load A', loadW: 2000, lengthM: 50 })],
      }),
    ],
    ...extra,
  };
}

describe('copper (conductor I²R) losses', () => {
  it('matches phases × I² × R for a known single-phase circuit', () => {
    const project = singlePhaseProject();
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);

    const c = system.panels['P1']!.circuits[0]!;
    // Re-derive the expected loss from the circuit's own design current + cable.
    const rOhm = conductorResistanceOhmPerKm(c.cable.csaMm2) * (50 / 1000);
    const expected = 2 * c.designCurrentA ** 2 * rOhm; // 2 conductors: line + return

    expect(c.phase).not.toBe('3ph'); // single-phase ⇒ 2 conductors
    expect(energy.losses.copperLossW).toBeCloseTo(expected, 1);
    // Independent sanity value: 220 V, 2 kW, cosφ 0.85 ⇒ ~10.7 A on 2.5 mm² over 50 m.
    expect(energy.losses.copperLossW).toBeGreaterThan(90);
    expect(energy.losses.copperLossW).toBeLessThan(115);
    expect(energy.losses.lossPercent).toBeGreaterThan(0);
  });

  it('counts three conductors for a three-phase circuit', () => {
    const project: ProjectInput = {
      id: 'PRJ3',
      name: '3ph',
      panels: [
        panel({
          id: 'P1',
          name: 'MDB',
          // > SINGLE_PHASE_MAX_W (5500 W) ⇒ supplied three-phase
          circuits: [branch({ id: 'c1', name: 'Big load', loadW: 30000, lengthM: 40 })],
        }),
      ],
    };
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);

    const c = system.panels['P1']!.circuits[0]!;
    const rOhm = conductorResistanceOhmPerKm(c.cable.csaMm2) * (40 / 1000);
    const expected = 3 * c.designCurrentA ** 2 * rOhm;

    expect(c.phase).toBe('3ph');
    expect(energy.losses.copperLossW).toBeCloseTo(expected, 1);
  });

  it('zero-length / zero-current circuits contribute no loss', () => {
    const project: ProjectInput = {
      id: 'PRJ0',
      name: 'zero',
      panels: [panel({ id: 'P1', name: 'DB', circuits: [branch({ id: 'c1', name: 'Idle', loadW: 0, lengthM: 0 })] })],
    };
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);
    expect(energy.losses.copperLossW).toBe(0);
  });
});

describe('transformer losses', () => {
  it('are zero for a low-voltage supply', () => {
    const project = singlePhaseProject();
    const system = computeSystem(project);
    expect(system.supply.type).toBe('LV');
    const energy = computeEnergyEconomics(project, system);
    expect(energy.losses.transformerLossW).toBe(0);
  });

  it('add no-load + load loss only for an MV supply', () => {
    // Demand > 200 kVA forces MV + transformer.
    const project: ProjectInput = {
      id: 'BIG',
      name: 'Factory',
      panels: [
        panel({
          id: 'P1',
          name: 'MDB',
          circuits: [
            branch({ id: 'c1', name: 'Process', loadW: 250000, lengthM: 30 }),
            branch({ id: 'c2', name: 'Utilities', loadW: 150000, lengthM: 25 }),
          ],
        }),
      ],
    };
    const system = computeSystem(project);
    expect(system.supply.type).toBe('MV');
    expect(system.supply.transformerKva).toBeGreaterThan(0);

    const energy = computeEnergyEconomics(project, system);
    expect(energy.losses.transformerLossW).toBeGreaterThan(0);

    // No-load ≈ 0.2% kVA (fixed); load ≈ 1% kVA × loading². Re-derive and compare.
    const kva = system.supply.transformerKva!;
    const loading = system.supply.demandKva / kva;
    const expected = (kva * 0.002 + kva * 0.01 * loading ** 2) * 1000;
    expect(energy.losses.transformerLossW).toBeCloseTo(expected, 0);
    // Components are each rounded independently, so the summed-then-rounded total
    // can differ from the sum-of-rounded components by up to ~0.1.
    expect(energy.losses.totalLossW).toBeCloseTo(
      energy.losses.copperLossW + energy.losses.transformerLossW,
      0,
    );
  });
});

describe('energy cost', () => {
  it('produces a positive monthly energy bill', () => {
    const project = singlePhaseProject();
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);
    expect(energy.dailyKwh).toBeGreaterThan(0);
    expect(energy.monthlyKwh).toBeGreaterThan(energy.dailyKwh * 30 * 0.99); // includes losses
    expect(energy.monthlyEnergyCost).toBeGreaterThan(0);
    expect(energy.annualLossCost).toBeGreaterThan(0);
  });

  it('honours a tariff override', () => {
    const project = singlePhaseProject();
    const system = computeSystem(project);
    const base = computeEnergyEconomics(project, system);
    const dearer = computeEnergyEconomics(project, system, { tariffIdrPerKwh: base.tariffIdrPerKwh * 2 });
    expect(dearer.tariffIdrPerKwh).toBeCloseTo(base.tariffIdrPerKwh * 2, 5);
    // Doubling the tariff doubles the bill; compare the ratio so an independent
    // ±1 IDR rounding of two multi-million-rupiah totals doesn't flake the test.
    expect(dearer.monthlyEnergyCost / base.monthlyEnergyCost).toBeCloseTo(2, 4);
  });

  it('scales loss energy by load factor when requested', () => {
    // Scheduled (non-continuous) load ⇒ load factor < 1, so scaling lowers loss energy.
    const project: ProjectInput = {
      id: 'SCHED',
      name: 'Scheduled',
      panels: [
        panel({
          id: 'P1',
          name: 'DB',
          system: '1ph',
          voltageV: 220,
          circuits: [
            branch({ id: 'c1', name: 'Daytime', loadW: 2000, lengthM: 50, schedule: { startHour: 8, endHour: 18 } }),
          ],
        }),
      ],
    };
    const system = computeSystem(project);
    const full = computeEnergyEconomics(project, system);
    const scaled = computeEnergyEconomics(project, system, { scaleLossesByLoadFactor: true });
    expect(scaled.dailyLossKwh).toBeLessThan(full.dailyLossKwh);
  });
});

describe('solar & battery ROI', () => {
  const pvProject = (): ProjectInput =>
    singlePhaseProject({
      sources: {
        solar: { enabled: true, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 },
        battery: { enabled: true, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' },
      },
    });

  it('gives a finite payback when PV is configured', () => {
    const project = pvProject();
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);

    expect(energy.solar.capex).toBeGreaterThan(0);
    expect(energy.solar.annualSavings).toBeGreaterThan(0);
    expect(energy.solar.paybackYears).toBeDefined();
    expect(Number.isFinite(energy.solar.paybackYears!)).toBe(true);
    // capex / annual savings, within rounding.
    expect(energy.solar.paybackYears!).toBeCloseTo(energy.solar.capex / energy.solar.annualSavings, 1);

    expect(energy.battery.capex).toBeGreaterThan(0);
  });

  it('leaves payback undefined when no PV is configured', () => {
    const project = singlePhaseProject();
    const system = computeSystem(project);
    const energy = computeEnergyEconomics(project, system);

    expect(energy.solar.capex).toBe(0);
    expect(energy.solar.annualSavings).toBe(0);
    expect(energy.solar.paybackYears).toBeUndefined();
    expect(energy.battery.capex).toBe(0);
  });
});
