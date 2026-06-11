import type { CircuitInput, PanelInput } from '@shared/types';

/**
 * A library of ready-made panel templates. Each template is a factory that
 * returns a fresh {@link PanelInput} with brand-new circuit ids on every call,
 * so the same template can be added repeatedly without id collisions. Defaults
 * mirror the realistic seed building in `sampleProject.ts`.
 */

/** Collision-resistant id; falls back to a counter when crypto is unavailable. */
let templateSeq = 0;
function freshId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-tpl${(templateSeq += 1)}`;
}

/** Build a branch circuit with sensible neutral defaults, overridden by `c`. */
function branch(c: Partial<CircuitInput> & { name: string }): CircuitInput {
  return {
    id: freshId('c'),
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...c,
  };
}

/** Build a panel with the common defaults, then apply `p`. */
function panel(p: Partial<PanelInput> & { name: string; circuits: CircuitInput[] }): PanelInput {
  return {
    id: freshId('P'),
    system: '3ph',
    voltageV: 400,
    ambientTempC: 35,
    installMethod: 'conduit',
    groupingCount: 3,
    diversityFactor: 0.8,
    sourceType: 'feeder',
    ...p,
  };
}

/** A reusable panel template: metadata plus a fresh-id panel factory. */
export interface PanelTemplate {
  id: string;
  label: string;
  description: string;
  /** Build a brand-new panel (fresh ids) from this template. */
  build: () => PanelInput;
}

/** Lighting & power distribution board: lighting and socket final circuits. */
function lightingDb(): PanelInput {
  return panel({
    name: 'Lighting distribution board',
    occupancy: 'commercial',
    circuits: [
      branch({
        name: 'Lighting — Area A',
        loadW: 4000,
        loadKind: 'lighting',
        isLighting: true,
        cosPhi: 0.9,
        lengthM: 30,
        schedule: { startHour: 8, endHour: 18 },
      }),
      branch({
        name: 'Lighting — Area B',
        loadW: 4000,
        loadKind: 'lighting',
        isLighting: true,
        cosPhi: 0.9,
        lengthM: 35,
        schedule: { startHour: 8, endHour: 18 },
      }),
      branch({
        name: 'Emergency lighting',
        loadW: 1500,
        loadKind: 'lighting',
        isLighting: true,
        cosPhi: 0.9,
        lengthM: 40,
      }),
      branch({
        name: 'General socket outlets',
        loadW: 6000,
        loadKind: 'socket',
        cosPhi: 0.9,
        demandFactor: 0.7,
        lengthM: 25,
        schedule: { startHour: 8, endHour: 18 },
      }),
    ],
  });
}

/** Standard pump control panel: a DOL fill pump plus a Y-Δ duty pump. */
function pumpControlPanel(): PanelInput {
  return panel({
    name: 'Pump control panel',
    circuits: [
      branch({
        name: 'Transfer pump (fill)',
        loadKind: 'pump',
        motorKw: 5.5,
        starterType: 'DOL',
        startingDuty: 'normal',
        controlMode: 'fill',
        sensing: 'electrode',
        lengthM: 15,
      }),
      branch({
        name: 'Duty pump (Y-Δ)',
        loadKind: 'pump',
        motorKw: 22,
        starterType: 'STAR_DELTA',
        startingDuty: 'normal',
        controlMode: 'duplex',
        sensing: 'pressure',
        lengthM: 18,
      }),
    ],
  });
}

/** Office socket DB: ring/radial socket circuits for workstations and comms. */
function officeSocketDb(): PanelInput {
  return panel({
    name: 'Office socket DB',
    occupancy: 'office',
    circuits: [
      branch({
        name: 'Workstation sockets — North',
        loadW: 5000,
        loadKind: 'socket',
        cosPhi: 0.9,
        demandFactor: 0.7,
        lengthM: 25,
        schedule: { startHour: 8, endHour: 18 },
      }),
      branch({
        name: 'Workstation sockets — South',
        loadW: 5000,
        loadKind: 'socket',
        cosPhi: 0.9,
        demandFactor: 0.7,
        lengthM: 30,
        schedule: { startHour: 8, endHour: 18 },
      }),
      branch({
        name: 'Server / comms room',
        loadW: 4000,
        loadKind: 'ups',
        cosPhi: 0.9,
        lengthM: 35,
      }),
      branch({
        name: 'Pantry / appliances',
        loadW: 3500,
        loadKind: 'socket',
        cosPhi: 0.9,
        demandFactor: 0.7,
        lengthM: 20,
        schedule: { startHour: 8, endHour: 18 },
      }),
    ],
  });
}

/** Motor control centre: a small fleet of motors on assorted starters. */
function motorControlCentre(): PanelInput {
  return panel({
    name: 'Motor control centre (MCC)',
    circuits: [
      branch({
        name: 'Motor 1 (DOL)',
        loadKind: 'motor',
        motorKw: 7.5,
        starterType: 'DOL',
        startingDuty: 'normal',
        lengthM: 15,
      }),
      branch({
        name: 'Motor 2 (Y-Δ)',
        loadKind: 'motor',
        motorKw: 30,
        starterType: 'STAR_DELTA',
        startingDuty: 'normal',
        lengthM: 20,
      }),
      branch({
        name: 'Fan (VFD)',
        loadKind: 'motor',
        motorKw: 15,
        starterType: 'VFD',
        startingDuty: 'normal',
        lengthM: 22,
      }),
      branch({
        name: 'Conveyor (reversing)',
        loadKind: 'motor',
        motorKw: 11,
        starterType: 'REVERSING',
        startingDuty: 'heavy',
        lengthM: 18,
      }),
    ],
  });
}

/**
 * Elevator / lift machine-room board: the hoist motor on a VFD with heavy
 * starting duty (the engine's starting analysis + harmonics pass both key off
 * this), plus the EN 81-style ancillaries — car/shaft lighting, machine-room
 * light & socket, pit light & socket, and the machine-room ventilation fan.
 * Lifts take a dedicated feeder, so stamp it and wire it under the MDP.
 */
function elevatorPanel(): PanelInput {
  return panel({
    name: 'Elevator machine room',
    circuits: [
      branch({
        name: 'Lift hoist motor (VFD)',
        loadKind: 'motor',
        motorKw: 11,
        starterType: 'VFD',
        startingDuty: 'heavy',
        lengthM: 8,
      }),
      branch({
        name: 'Car & shaft lighting',
        loadW: 800,
        loadKind: 'lighting',
        isLighting: true,
        cosPhi: 0.9,
        lengthM: 35,
      }),
      branch({
        name: 'Machine-room lighting',
        loadW: 300,
        loadKind: 'lighting',
        isLighting: true,
        cosPhi: 0.9,
        lengthM: 8,
      }),
      branch({
        name: 'Machine-room socket outlet',
        loadW: 1500,
        loadKind: 'socket',
        cosPhi: 0.9,
        demandFactor: 0.7,
        lengthM: 8,
      }),
      branch({
        name: 'Pit lighting & socket',
        loadW: 800,
        loadKind: 'general',
        cosPhi: 0.9,
        lengthM: 30,
      }),
      branch({
        name: 'Ventilation fan',
        loadKind: 'motor',
        motorKw: 0.75,
        starterType: 'DOL',
        startingDuty: 'normal',
        lengthM: 6,
      }),
    ],
  });
}

/** The catalog of available panel templates, in picker order. */
export const PANEL_TEMPLATES: readonly PanelTemplate[] = [
  {
    id: 'lighting-db',
    label: 'Lighting distribution board',
    description: 'Lighting and general socket final circuits for a commercial area.',
    build: lightingDb,
  },
  {
    id: 'pump-control',
    label: 'Standard pump control panel',
    description: 'A DOL fill pump and a star-delta duty pump with level control.',
    build: pumpControlPanel,
  },
  {
    id: 'office-socket-db',
    label: 'Office socket DB',
    description: 'Workstation, comms and pantry socket circuits for an office floor.',
    build: officeSocketDb,
  },
  {
    id: 'mcc',
    label: 'Motor control centre (MCC)',
    description: 'A fleet of motors on DOL, star-delta, VFD and reversing starters.',
    build: motorControlCentre,
  },
  {
    id: 'elevator',
    label: 'Elevator / lift machine room',
    description: 'VFD hoist motor (heavy duty) with car/shaft/pit lighting, socket and ventilation.',
    build: elevatorPanel,
  },
];

/** Look up a template by id (undefined when unknown). */
export function findPanelTemplate(id: string): PanelTemplate | undefined {
  return PANEL_TEMPLATES.find((t) => t.id === id);
}
