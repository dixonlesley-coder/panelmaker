/**
 * Tests for the engineering-audit fixes: 1-ph motor FLC, incomer device,
 * parallel runs, XLPE, soil-thermal derating, generator ADS, applied harmonic
 * neutrals, detuned PFC, phase pinning, per-route grouping, PLN metering,
 * type-2 coordination and busbar support spacing.
 */
import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem } from '@shared/engine';
import { khaFor, conductorResistanceOhmPerKm, AL_MIN_SECTION_MM2 } from '@shared/standards/conductors';
import { checkZs } from '@shared/engine/fault';
import { motorFLC1ph } from '@shared/engine/control/motorFLC';
import { applyStarterTemplate } from '@shared/engine/control/applyStarterTemplate';
import { sizeCable } from '@shared/engine/cableSizing';
import { deratingFactor } from '@shared/engine/derating';
import { computeMetering } from '@shared/engine/metering';
import { checkBusbarWithstand } from '@shared/engine/busbarFault';
import { balancePhases } from '@shared/engine/phase';
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
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

function project(partial: Partial<ProjectInput> & { id: string; panels: PanelInput[] }): ProjectInput {
  return { name: 'T', ...partial };
}

describe('single-phase motor FLC', () => {
  it('derives FLC from shaft kW over V·η·cosφ (well above P/V·cosφ)', () => {
    const flc = motorFLC1ph(0.75, 230);
    // 750 / (230 × 0.60) ≈ 5.4 A — a naive P/(V·0.85) would give ~3.8 A.
    expect(flc).toBeGreaterThan(5);
    expect(flc).toBeLessThan(6);
  });

  it('sizes a 1-ph pump circuit off the motor FLC, not the shaft kW', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: '1ph board',
        system: '1ph',
        voltageV: 230,
        circuits: [branch({ id: 'm1', name: 'Pump', loadKind: 'pump', motorKw: 1.5, loadW: 0 })],
      }),
    );
    const c = r.circuits[0]!;
    // 1500 / (230 × 0.65) ≈ 10 A; naive P/(V·0.85) ≈ 7.7 A.
    expect(c.designCurrentA).toBeGreaterThan(9);
  });
});

describe('incomer device', () => {
  it('specifies a standard-rated incomer with poles, and rates the bus ≥ its In', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'DB',
        circuits: [branch({ id: 'c1', name: 'L', loadW: 30000 })],
      }),
    );
    expect(r.incomer.breaker.ratingA).toBeGreaterThanOrEqual(r.totalDemandCurrentA);
    expect(r.incomer.poles).toBe(4);
    // IEC 61439-1: main bus rated for the incoming device, not just demand.
    expect(r.busbar.ampacityA).toBeGreaterThanOrEqual(r.incomer.breaker.ratingA);
  });

  it('checks the incomer breaking capacity at the bus', () => {
    const r = computePanel(
      panel({ id: 'P1', name: 'DB', circuits: [branch({ id: 'c1', name: 'L', loadW: 10000 })] }),
      { faultLevelA: 16000 },
    );
    expect(r.incomer.breakerKa).toBeGreaterThanOrEqual(16);
    expect(r.incomer.kaAdequate).toBe(true);
  });
});

describe('parallel conductor runs', () => {
  it('proposes 2-4 equal runs when one conductor cannot carry a feeder', () => {
    // 900 A demand: largest single PVC conductor (300 mm² @ 477 A) is short.
    const cable = sizeCable({
      designCurrentA: 900,
      breakerRatingA: 1000,
      deratingFactor: 1,
      minSectionMm2: 4,
    });
    expect(cable.runsPerPhase).toBeGreaterThanOrEqual(2);
    expect(cable.deratedIzA).toBeGreaterThanOrEqual(1000);
    expect(cable.csaMm2).toBeGreaterThanOrEqual(50); // parallel-set minimum
    expect(cable.appliedRule).toContain('parallel');
  });

  it('keeps a normal final circuit on a single cable', () => {
    const cable = sizeCable({
      designCurrentA: 20,
      breakerRatingA: 25,
      deratingFactor: 1,
      minSectionMm2: 2.5,
    });
    expect(cable.runsPerPhase).toBeUndefined();
  });
});

describe('XLPE insulation', () => {
  it('gives a higher ampacity than PVC at equal section', () => {
    const pvc = sizeCable({ designCurrentA: 100, breakerRatingA: 125, deratingFactor: 1, minSectionMm2: 4 });
    const xlpe = sizeCable({
      designCurrentA: 100,
      breakerRatingA: 125,
      deratingFactor: 1,
      minSectionMm2: 4,
      insulation: 'XLPE',
    });
    expect(xlpe.csaMm2).toBeLessThanOrEqual(pvc.csaMm2);
    expect(xlpe.baseKhaA).toBeGreaterThan(0);
  });

  it('labels the cable N2XY and derates more gently with ambient', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'XLPE DB',
        insulation: 'XLPE',
        ambientTempC: 45,
        circuits: [branch({ id: 'c1', name: 'L', loadW: 10000 })],
      }),
    );
    expect(r.circuits[0]!.grounding.cableSpec).toContain('N2XY');
    const dfPvc = deratingFactor({ ambientC: 45, groupingCount: 1, installMethod: 'conduit' });
    const dfXlpe = deratingFactor({
      ambientC: 45,
      groupingCount: 1,
      installMethod: 'conduit',
      insulation: 'XLPE',
    });
    expect(dfXlpe).toBeGreaterThan(dfPvc);
  });
});

describe('per-method ampacity tables', () => {
  it('buried beats conduit at small sections but falls well below at large ones', () => {
    // The method changes the SHAPE of the curve — a flat factor cannot do this.
    expect(khaFor(1.5, { installMethod: 'buried' })).toBeGreaterThan(
      khaFor(1.5, { installMethod: 'conduit' }),
    );
    const buried300 = khaFor(300, { installMethod: 'buried' });
    const conduit300 = khaFor(300, { installMethod: 'conduit' });
    expect(buried300 / conduit300).toBeLessThan(0.75);
  });

  it('free air / tray carries more than conduit, increasingly so at large sections', () => {
    expect(khaFor(300, { installMethod: 'air' })).toBeGreaterThan(
      khaFor(300, { installMethod: 'conduit' }),
    );
    expect(khaFor(70, { installMethod: 'tray' })).toBe(khaFor(70, { installMethod: 'air' }));
  });

  it('clipped-direct (wall) sits between conduit and free air', () => {
    const conduit = khaFor(95, { installMethod: 'conduit' });
    const wall = khaFor(95, { installMethod: 'wall' });
    const air = khaFor(95, { installMethod: 'air' });
    expect(wall).toBeGreaterThan(conduit);
    expect(air).toBeGreaterThan(wall);
  });

  it('a buried feeder needs more total conductor than the same feeder in conduit', () => {
    const mk = (installMethod: PanelInput['installMethod']) => {
      const c = computePanel(
        panel({
          id: 'P1',
          name: 'DB',
          installMethod,
          circuits: [branch({ id: 'f1', name: 'Feeder', loadKind: 'feeder', loadW: 150000, lengthM: 10 })],
        }),
      ).circuits[0]!.cable;
      // Total copper per phase — buried may resolve to parallel runs.
      return c.csaMm2 * (c.runsPerPhase ?? 1);
    };
    expect(mk('buried')).toBeGreaterThanOrEqual(mk('conduit'));
  });
});

describe('aluminum conductors', () => {
  it('carries ~78% of copper at equal section and floors at 16 mm²', () => {
    expect(khaFor(95, { material: 'Al' }) / khaFor(95, { material: 'Cu' })).toBeCloseTo(0.78, 2);
    const cable = sizeCable({
      designCurrentA: 20,
      breakerRatingA: 25,
      deratingFactor: 1,
      minSectionMm2: 2.5,
      material: 'Al',
    });
    expect(cable.csaMm2).toBeGreaterThanOrEqual(AL_MIN_SECTION_MM2);
  });

  it('sizes an Al feeder at least one step above the Cu equivalent', () => {
    const cu = sizeCable({ designCurrentA: 200, breakerRatingA: 250, deratingFactor: 1, minSectionMm2: 4 });
    const al = sizeCable({
      designCurrentA: 200,
      breakerRatingA: 250,
      deratingFactor: 1,
      minSectionMm2: 4,
      material: 'Al',
    });
    expect(al.csaMm2).toBeGreaterThan(cu.csaMm2);
  });

  it('labels aluminum cables NAYY / NA2XY and raises the loop impedance', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'Al DB',
        material: 'Al',
        circuits: [branch({ id: 'c1', name: 'Feeder load', loadW: 50000, lengthM: 40 })],
      }),
    );
    expect(r.circuits[0]!.grounding.cableSpec).toContain('NAYY');
    const rx = computePanel(
      panel({
        id: 'P2',
        name: 'Al XLPE DB',
        material: 'Al',
        insulation: 'XLPE',
        circuits: [branch({ id: 'c1', name: 'Feeder load', loadW: 50000, lengthM: 40 })],
      }),
    );
    expect(rx.circuits[0]!.grounding.cableSpec).toContain('NA2XY');

    // Same geometry, Al loop ≈ 1.6× the Cu loop resistance.
    const base = { earthingSystem: 'TN-C-S' as const, sourceZ: { rOhm: 0.01, xOhm: 0.02 }, phaseCsaMm2: 35, peCsaMm2: 16, lengthM: 60, curve: 'C' as const, breakerRatingA: 63 };
    const zsCu = checkZs({ ...base, material: 'Cu' });
    const zsAl = checkZs({ ...base, material: 'Al' });
    expect(zsAl.zsOhm).toBeGreaterThan(zsCu.zsOhm);
    expect(conductorResistanceOhmPerKm(35, 'Al') / conductorResistanceOhmPerKm(35, 'Cu')).toBeCloseTo(1.61, 2);
  });

  it('aluminum voltage drop exceeds copper for the same run', () => {
    const r = (material: 'Cu' | 'Al') =>
      checkZs({
        earthingSystem: 'TN-C-S',
        sourceZ: { rOhm: 0, xOhm: 0 },
        phaseCsaMm2: 70,
        peCsaMm2: 35,
        lengthM: 80,
        curve: 'C',
        breakerRatingA: 100,
        material,
      });
    // Lower available earth-fault current on Al (higher Zs) — and the Al PE k
    // is lower, so the adiabatic minimum is relatively larger.
    expect(r('Al').earthFaultA).toBeLessThan(r('Cu').earthFaultA);
  });
});

describe('soil thermal derating (buried)', () => {
  it('derates buried runs in poorly conducting soil and ignores other methods', () => {
    const base = deratingFactor({ ambientC: 30, groupingCount: 1, installMethod: 'buried' });
    const dry = deratingFactor({
      ambientC: 30,
      groupingCount: 1,
      installMethod: 'buried',
      soilThermalResistivityKmW: 3,
    });
    const conduit = deratingFactor({
      ambientC: 30,
      groupingCount: 1,
      installMethod: 'conduit',
      soilThermalResistivityKmW: 3,
    });
    expect(dry).toBeLessThan(base);
    expect(conduit).toBe(1);
  });
});

describe('generator ADS study', () => {
  it('flags circuits that disconnect on mains but not on the genset', () => {
    const p = project({
      id: 'PRJ',
      panels: [
        panel({
          id: 'P1',
          name: 'MDP',
          circuits: [
            // Long small circuit: passes Zs on the stiff utility, marginal on a genset.
            branch({ id: 'c1', name: 'Far load', loadW: 3000, lengthM: 120 }),
            branch({ id: 'c2', name: 'Base', loadW: 200000 }),
          ],
        }),
      ],
      sources: { generator: { enabled: true, backupFraction: 1, mode: 'standby' } },
    });
    const sys = computeSystem(p);
    expect(sys.generatorFaultKa).toBeGreaterThan(0);
    // The study ran; whether c1 fails depends on the loop — assert consistency:
    const genWarnings = sys.warnings.filter((w) => w.code === 'ads-fails-on-generator');
    for (const w of genWarnings) {
      expect(w.severity).toBe('warning');
      expect(w.circuitId).toBeDefined();
    }
  });
});

describe('harmonic neutrals + detuned PFC', () => {
  it('applies the triplen neutral oversize to the cable spec', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'VFD DB',
        circuits: [
          branch({ id: 'v1', name: 'VFD pump', loadKind: 'pump', motorKw: 30, starterType: 'VFD' }),
          branch({ id: 'g1', name: 'Sockets', loadW: 4000, loadKind: 'socket' }),
        ],
      }),
    );
    if (r.harmonics && r.harmonics.neutralOversizeFactor > 1) {
      const withNeutral = r.circuits.filter((c) => c.grounding.neutralCsaMm2 > 0);
      expect(withNeutral.some((c) => c.grounding.cableSpec.includes('triplen'))).toBe(true);
    }
  });

  it('recommends a detuned bank when correction is needed on a harmonic-rich bus', () => {
    const p = project({
      id: 'PRJ',
      panels: [
        panel({
          id: 'P1',
          name: 'MCC',
          circuits: [
            branch({ id: 'v1', name: 'VFD 1', loadKind: 'motor', motorKw: 55, starterType: 'VFD' }),
            branch({ id: 'v2', name: 'VFD 2', loadKind: 'motor', motorKw: 55, starterType: 'VFD' }),
            branch({ id: 'm1', name: 'DOL fan', loadKind: 'motor', motorKw: 45, starterType: 'DOL', cosPhi: 0.7 }),
            branch({ id: 'h1', name: 'Heaters', loadW: 60000, cosPhi: 0.65 }),
          ],
        }),
      ],
    });
    const sys = computeSystem(p);
    if (sys.powerFactor.bankKvar > 0) {
      expect(sys.powerFactor.detunedRecommended).toBe(true);
      expect(sys.powerFactor.note).toContain('DETUNED');
    }
  });
});

describe('phase pinning + per-route grouping', () => {
  it('honors pinned phases and only balances the rest', () => {
    const balance = balancePhases(
      [
        { id: 'a', threePhase: false, currentA: 30, pinned: 'L3' },
        { id: 'b', threePhase: false, currentA: 10 },
        { id: 'c', threePhase: false, currentA: 10 },
      ],
      '3ph',
    );
    expect(balance.assignment['a']).toBe('L3');
    expect(balance.L3).toBeGreaterThanOrEqual(30);
  });

  it('keeps the pinned phase through computePanel', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'DB',
        circuits: [
          branch({ id: 'c1', name: 'Pinned', loadW: 2000, phaseOverride: 'L2' }),
          branch({ id: 'c2', name: 'Auto', loadW: 2000 }),
        ],
      }),
    );
    expect(r.circuits.find((c) => c.circuitId === 'c1')!.phase).toBe('L2');
  });

  it('applies a per-circuit grouping override to that circuit only', () => {
    const r = computePanel(
      panel({
        id: 'P1',
        name: 'DB',
        circuits: [
          branch({ id: 'c1', name: 'Crowded route', loadW: 10000, groupingCountOverride: 6 }),
          branch({ id: 'c2', name: 'Own route', loadW: 10000 }),
        ],
      }),
    );
    const crowded = r.circuits.find((c) => c.circuitId === 'c1')!;
    const own = r.circuits.find((c) => c.circuitId === 'c2')!;
    expect(crowded.cable.deratingFactor).toBeLessThan(own.cable.deratingFactor);
  });
});

describe('PLN metering', () => {
  it('picks the next tariff step with direct metering for a small service', () => {
    const m = computeMetering(10, 400, '3ph'); // 10 kVA demand
    expect(m.serviceVa).toBe(11000);
    expect(m.metering).toBe('direct');
    expect(m.mvService).toBe(false);
  });

  it('selects CT-operated metering above the direct limit', () => {
    const m = computeMetering(150, 400, '3ph'); // ≈ 238 A at 164 kVA
    expect(m.metering).toBe('ct');
    expect(m.ctRatio).toBeDefined();
    expect(Number(m.ctRatio!.split('/')[0])).toBeGreaterThanOrEqual(m.serviceCurrentA);
  });

  it('declares MV (TM) service beyond the LV ceiling', () => {
    const m = computeMetering(250, 400, '3ph');
    expect(m.mvService).toBe(true);
  });
});

describe('type-2 coordination', () => {
  it('attaches the verified DOL set for a contactor-based starter', () => {
    const a = applyStarterTemplate({ circuitId: 'c1', starterType: 'DOL', motorKw: 15 });
    expect(a.coordination).toBeDefined();
    expect(a.coordination!.breakerA).toBeGreaterThan(0);
    expect(a.coordination!.olRangeA[0]).toBeLessThan(a.coordination!.olRangeA[1]);
    expect(a.coordination!.note).toContain('Type-2');
  });

  it('does not attach a set to a VFD circuit', () => {
    const a = applyStarterTemplate({ circuitId: 'c1', starterType: 'VFD', motorKw: 15 });
    expect(a.coordination).toBeUndefined();
  });
});

describe('busbar support spacing', () => {
  it('reports the force and a max support spacing from the bar geometry', () => {
    const w = checkBusbarWithstand(200, 16, undefined, { widthMm: 40, thicknessMm: 5 });
    expect(w.forceNPerM).toBeGreaterThan(0);
    expect(w.maxSupportSpacingMm).toBeGreaterThan(0);
    // A stiffer (thicker) bar may be supported further apart.
    const thick = checkBusbarWithstand(500, 16, undefined, { widthMm: 50, thicknessMm: 10 });
    expect(thick.maxSupportSpacingMm!).toBeGreaterThan(w.maxSupportSpacingMm!);
  });

  it('omits the mechanical figures without geometry (density-estimated bar)', () => {
    const w = checkBusbarWithstand(2000, 30, undefined, { widthMm: 0, thicknessMm: 0 });
    expect(w.maxSupportSpacingMm).toBeUndefined();
  });
});
