import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

let seq = 0;
const id = (p: string) => `${p}-${(seq += 1)}`;

function branch(c: Partial<CircuitInput> & { name: string }): CircuitInput {
  return {
    id: id('c'),
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 25,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...c,
  };
}

function panel(p: Partial<PanelInput> & { name: string; circuits: CircuitInput[] }): PanelInput {
  return {
    id: id('P'),
    system: '3ph',
    voltageV: 400,
    ambientTempC: 35,
    installMethod: 'conduit',
    groupingCount: 3,
    diversityFactor: 0.8,
    sourceType: 'utility',
    ...p,
  };
}

/** A realistic seed building: a main LV panel feeding a lighting/power DB and a pump MCC. */
export function createSampleProject(): ProjectInput {
  seq = 0;

  const lpDb = panel({
    name: 'LP-DB (Lighting & Power)',
    sourceType: 'feeder',
    circuits: [
      branch({
        name: 'Lighting — Ground floor',
        loadW: 6000,
        loadKind: 'lighting',
        isLighting: true,
        lengthM: 35,
        schedule: { startHour: 8, endHour: 18 },
      }),
      branch({ name: 'Socket outlets', loadW: 8000, lengthM: 30, schedule: { startHour: 8, endHour: 18 } }),
      branch({
        name: 'Air conditioning',
        loadW: 12000,
        loadKind: 'hvac',
        lengthM: 20,
        cosPhi: 0.9,
        schedule: { startHour: 9, endHour: 17 },
      }),
      branch({
        name: 'EV charging',
        loadW: 11000,
        loadKind: 'ev_charger',
        cosPhi: 0.98,
        lengthM: 25,
        schedule: { startHour: 22, endHour: 6 },
      }),
      branch({
        name: 'Car-park lighting (long run)',
        loadW: 5000,
        loadKind: 'lighting',
        isLighting: true,
        lengthM: 180,
        schedule: { startHour: 17, endHour: 23 },
      }),
    ],
  });

  const mcc = panel({
    name: 'MCC (Pump Motor Control)',
    sourceType: 'feeder',
    circuits: [
      branch({
        name: 'Transfer pump (fill)',
        loadKind: 'pump',
        motorKw: 5.5,
        starterType: 'DOL',
        controlMode: 'fill',
        sensing: 'electrode',
        lengthM: 15,
        cosPhi: 0.85,
      }),
      branch({
        name: 'Main pump (Y-Δ)',
        loadKind: 'motor',
        motorKw: 37,
        starterType: 'STAR_DELTA',
        startingDuty: 'normal',
        lengthM: 18,
      }),
      branch({
        name: 'Booster pump (VFD)',
        loadKind: 'pump',
        motorKw: 11,
        starterType: 'VFD',
        controlMode: 'booster',
        sensing: 'pressure',
        lengthM: 22,
      }),
    ],
  });

  const main = panel({
    name: 'MDP (Main Distribution)',
    sourceType: 'utility',
    diversityFactor: 0.9,
    circuits: [
      branch({ name: 'Feeder → LP-DB', loadKind: 'feeder', feedsPanelId: lpDb.id, lengthM: 40, cosPhi: 0.85 }),
      branch({ name: 'Feeder → MCC', loadKind: 'feeder', feedsPanelId: mcc.id, lengthM: 30, cosPhi: 0.85 }),
    ],
  });

  // wire the feeder back-references
  lpDb.fedByCircuitId = main.circuits[0]!.id;
  mcc.fedByCircuitId = main.circuits[1]!.id;

  return {
    id: 'PRJ-1',
    name: 'Sample Commercial Building',
    panels: [main, lpDb, mcc],
  };
}
