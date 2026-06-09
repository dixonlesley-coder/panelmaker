import { describe, it, expect } from 'vitest';
import {
  checkBreakerKa,
  checkZs,
  computePanel,
  computeSystem,
  conductorImpedance,
  downstreamFaultA,
  impedanceMagnitude,
  mainBusFaultA,
  nonSelective,
  sourceImpedanceFromIsc,
} from '@shared/engine';
import { DEFAULT_LV_UTILITY_FAULT_KA } from '@shared/standards';
import type { CircuitInput, PanelInput, ProjectInput, SupplyResult } from '@shared/types';

function branch(p: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...p,
  };
}

function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...p,
  };
}

/** A medium-voltage supply with an explicit transformer for Isc tests. */
function mvSupply(kva: number, zPct: number, vLL = 400): SupplyResult {
  return {
    type: 'MV',
    voltageV: vLL,
    demandKva: kva * 0.8,
    transformerKva: kva,
    transformerImpedancePct: zPct,
    transformerSecondaryA: Math.round((kva * 1000) / (Math.sqrt(3) * vLL)),
    note: '',
  };
}

describe('fault level at the main bus', () => {
  it('a 1000 kVA / 4% transformer gives ~36 kA at 400 V', () => {
    const isc = mainBusFaultA(mvSupply(1000, 4));
    expect(isc / 1000).toBeCloseTo(36, 0);
  });

  it('halving the impedance roughly doubles the fault current', () => {
    const z4 = mainBusFaultA(mvSupply(1000, 4));
    const z2 = mainBusFaultA(mvSupply(1000, 2));
    expect(z2 / z4).toBeCloseTo(2, 1);
  });

  it('a direct LV supply assumes the default utility fault level', () => {
    const lv: SupplyResult = { type: 'LV', voltageV: 400, demandKva: 50, note: '' };
    expect(mainBusFaultA(lv)).toBe(DEFAULT_LV_UTILITY_FAULT_KA * 1000);
  });
});

describe('fault decay down a feeder', () => {
  it('Isc falls as cable impedance accumulates and is clamped to upstream', () => {
    const upstream = 36000;
    const sourceZ = sourceImpedanceFromIsc(upstream, 400);

    // A long, modest-section run adds appreciable impedance -> lower fault.
    const longRun = conductorImpedance(25, 200); // 25 mm^2, 200 m
    const totalZ = { rOhm: sourceZ.rOhm + longRun.rOhm, xOhm: sourceZ.xOhm + longRun.xOhm };
    const downstream = downstreamFaultA(400, totalZ, upstream);

    expect(downstream).toBeLessThan(upstream);
    // 25 mm^2 over 200 m ~ 0.17 ohm -> well under ~1.4 kA.
    expect(downstream / 1000).toBeLessThan(2);

    // A negligible run barely moves it and never exceeds the upstream value.
    const shortRun = conductorImpedance(240, 1);
    const nearZ = { rOhm: sourceZ.rOhm + shortRun.rOhm, xOhm: sourceZ.xOhm + shortRun.xOhm };
    expect(downstreamFaultA(400, nearZ, upstream)).toBeLessThanOrEqual(upstream);
    expect(downstreamFaultA(400, nearZ, upstream)).toBeGreaterThan(upstream * 0.95);
  });
});

describe('breaker breaking-capacity adequacy', () => {
  it('an MCB tops out at 10 kA, so a 15 kA fault is inadequate; an MCCB covers it', () => {
    // The helper specifies the smallest adequate Icu; an MCB family maxes at 10 kA.
    const mcbOk = checkBreakerKa({ ratingA: 32, deviceClass: 'MCB', curve: 'C' }, 8);
    expect(mcbOk.breakerKa).toBe(10); // upsized from 6 to the 10 kA variant
    expect(mcbOk.adequate).toBe(true);

    const mcbBad = checkBreakerKa({ ratingA: 32, deviceClass: 'MCB', curve: 'C' }, 15);
    expect(mcbBad.adequate).toBe(false); // 10 kA ceiling < 15 kA fault
    expect(mcbBad.breakerKa).toBe(10);

    const mccb = checkBreakerKa({ ratingA: 250, deviceClass: 'MCCB', curve: 'C' }, 30);
    expect(mccb.adequate).toBe(true);
    expect(mccb.breakerKa).toBeGreaterThanOrEqual(30);
  });

  it('emits an error when a panel breaker cannot break the prospective fault', () => {
    // A large load forces an MV transformer supply with a high (~29 kA) bus fault;
    // a small 6/10 kA MCB branch on that bus cannot break it.
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [
            branch({ id: 'big', name: 'Big load', loadW: 500_000 }),
            branch({ id: 'sm', name: 'Small final', loadW: 3000 }),
          ],
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.supply.type).toBe('MV');
    const main = sys.panels['MAIN']!;
    expect(main.faultLevelKa).toBeGreaterThan(10);

    const small = main.circuits.find((c) => c.circuitId === 'sm')!;
    expect(small.breaker.deviceClass).toBe('MCB');
    expect(small.breakerKa).toBeDefined();
    expect(small.kaAdequate).toBe(false); // MCB Icu (<=10 kA) < ~29 kA fault
    expect(sys.warnings.some((w) => w.code === 'breaking-capacity-inadequate')).toBe(true);
  });
});

describe('earth-fault loop impedance (Zs) and ADS', () => {
  it('a short run on a TN system disconnects in time', () => {
    const zs = checkZs({
      earthingSystem: 'TN-S',
      sourceZ: { rOhm: 0, xOhm: 0.02 },
      phaseCsaMm2: 4,
      peCsaMm2: 4,
      lengthM: 15,
      curve: 'C', // Ia = 10 x In
      breakerRatingA: 16,
    });
    // Zs_max = 0.95 * 230 / (10*16) = 1.366 ohm; a 15 m / 4 mm^2 loop is well under.
    expect(zs.zsMaxOhm).toBeCloseTo(1.366, 2);
    expect(zs.zsOhm).toBeLessThanOrEqual(zs.zsMaxOhm);
    expect(zs.disconnectsInTime).toBe(true);
  });

  it('a long thin run on TN exceeds Zs_max and fails to disconnect', () => {
    const zs = checkZs({
      earthingSystem: 'TN-S',
      sourceZ: { rOhm: 0, xOhm: 0.02 },
      phaseCsaMm2: 1.5,
      peCsaMm2: 1.5,
      lengthM: 120,
      curve: 'C',
      breakerRatingA: 40,
    });
    expect(zs.zsOhm).toBeGreaterThan(zs.zsMaxOhm);
    expect(zs.disconnectsInTime).toBe(false);
  });

  it('TT relaxes the ADS loop check (RCD provides fault protection)', () => {
    const zs = checkZs({
      earthingSystem: 'TT',
      sourceZ: { rOhm: 0, xOhm: 0.02 },
      phaseCsaMm2: 1.5,
      peCsaMm2: 1.5,
      lengthM: 120,
      curve: 'C',
      breakerRatingA: 40,
    });
    expect(zs.disconnectsInTime).toBe(true);
  });

  it('a panel with a long thin final circuit raises a zs-too-high warning (TN)', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      earthingSystem: 'TN-S',
      panels: [
        panel({
          id: 'P',
          name: 'DB',
          circuits: [branch({ id: 'lng', name: 'Far load', loadW: 6000, lengthM: 150 })],
        }),
      ],
    };
    const sys = computeSystem(project);
    const c = sys.panels['P']!.circuits[0]!;
    expect(c.zsOhm).toBeDefined();
    expect(c.disconnectsInTime).toBe(false);
    expect(sys.warnings.some((w) => w.code === 'zs-too-high')).toBe(true);
  });
});

describe('selectivity / discrimination', () => {
  it('warns when the upstream feeder is below 1.6x the downstream branch', () => {
    expect(nonSelective(100, 80)).toBe(true); // 100 < 128
    expect(nonSelective(160, 80)).toBe(false); // 160 >= 128
    expect(nonSelective(50, 0)).toBe(false); // no downstream -> n/a
  });

  it('flags a feeder that does not discriminate with the sub-panel branch', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [branch({ id: 'f', name: 'Feeder to SDB', loadKind: 'feeder', feedsPanelId: 'SDB' })],
        }),
        panel({
          id: 'SDB',
          name: 'Sub DB',
          sourceType: 'feeder',
          fedByCircuitId: 'f',
          // One dominant branch nearly as large as the whole sub-panel feed,
          // so feeder In is not >= 1.6 x this branch In.
          circuits: [branch({ id: 'b1', name: 'Big branch', loadW: 60_000 })],
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.warnings.some((w) => w.code === 'selectivity-risk')).toBe(true);
  });

  it('does not flag when the feeder is comfortably larger than every branch', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [branch({ id: 'f', name: 'Feeder to SDB', loadKind: 'feeder', feedsPanelId: 'SDB' })],
        }),
        panel({
          id: 'SDB',
          name: 'Sub DB',
          sourceType: 'feeder',
          fedByCircuitId: 'f',
          // Many small branches: the (3-phase) feeder rating is comfortably
          // >= 1.6x any single (1-phase) branch breaker -> discriminates.
          circuits: Array.from({ length: 8 }, (_, i) =>
            branch({ id: `b${i}`, name: `Load ${i}`, loadW: 2000 }),
          ),
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.warnings.some((w) => w.code === 'selectivity-risk')).toBe(false);
  });
});
