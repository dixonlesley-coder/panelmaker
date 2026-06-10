/**
 * Pure mapping helpers between the camelCase engine/domain model and the
 * snake_case DB rows. Keeping these isolated guarantees the save/load round-trip
 * is symmetric (saveProject -> loadProject yields an equivalent ProjectInput).
 *
 * Drizzle already maps column names to the property names declared in the
 * schema (which we kept camelCase), so most of the "snake_case" boundary lives
 * inside Drizzle. These helpers translate the remaining model-vs-row shape
 * differences: optional fields (undefined <-> null), JSON columns, and fields
 * the DB carries that the engine model omits.
 */

import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types/project';
import type { Part } from '@shared/types/parts';
import type { CircuitResult } from '@shared/types/results';
import type {
  CircuitRow,
  NewCircuitRow,
  NewPanelRow,
  NewPartRow,
  PanelRow,
  PartRow,
} from '../db/schema';

/* ----------------------------- null/undefined ----------------------------- */

/** DB stores absent optionals as NULL; the model uses `undefined`. */
function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}

/** Model `undefined` -> DB `null` so columns are written explicitly. */
function undefToNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

/* --------------------------------- parts ---------------------------------- */

export function partToRow(p: Part): NewPartRow {
  return {
    id: p.id,
    category: p.category,
    manufacturer: p.manufacturer,
    model: p.model,
    attributesJson: JSON.stringify(p.attributes ?? {}),
    defaultUnit: p.defaultUnit,
    standardsVersion: undefToNull(p.standardsVersion),
  };
}

export function rowToPart(r: PartRow): Part {
  let attributes: Record<string, unknown> = {};
  try {
    attributes = r.attributesJson ? (JSON.parse(r.attributesJson) as Record<string, unknown>) : {};
  } catch {
    attributes = {};
  }
  const part: Part = {
    id: r.id,
    category: r.category as Part['category'],
    manufacturer: r.manufacturer,
    model: r.model,
    attributes,
    defaultUnit: r.defaultUnit,
  };
  const sv = nullToUndef(r.standardsVersion);
  if (sv !== undefined) part.standardsVersion = sv;
  return part;
}

/* -------------------------------- circuits -------------------------------- */

export function circuitToRow(
  c: CircuitInput,
  panelId: string,
  orderIndex: number,
  panelSystem: PanelInput['system'],
): NewCircuitRow {
  return {
    id: c.id,
    panelId,
    role: c.role,
    orderIndex,
    name: c.name,
    loadW: c.loadW,
    cosPhi: c.cosPhi,
    lengthM: c.lengthM,
    demandFactor: c.demandFactor,
    loadKind: c.loadKind,
    // `phase` mirrors the owning panel's system for query convenience.
    phase: panelSystem,
    isLighting: c.isLighting,
    starterType: undefToNull(c.starterType),
    motorKw: undefToNull(c.motorKw),
    motorPoles: undefToNull(c.motorPoles),
    startingDuty: undefToNull(c.startingDuty),
    controlMode: undefToNull(c.controlMode),
    sensing: undefToNull(c.sensing),
    cableOverrideMm2: undefToNull(c.cableOverrideMm2),
    breakerOverrideA: undefToNull(c.breakerOverrideA),
    busbarBreakBefore: c.busbarBreakBefore === true ? true : null,
    phaseOverride: undefToNull(c.phaseOverride),
    groupingOverride: undefToNull(c.groupingCountOverride),
    scheduleStartHour: c.schedule ? c.schedule.startHour : null,
    scheduleEndHour: c.schedule ? c.schedule.endHour : null,
    feedsPanelId: undefToNull(c.feedsPanelId),
    chosenCablePartId: null,
    chosenBreakerPartId: null,
    computedJson: null,
    pointsJson: encodePoints(c),
  };
}

/** Point-level detail ({fixtures, switchGroups, sockets}) as a JSON blob, or null. */
function encodePoints(c: CircuitInput): string | null {
  const fixtures = c.fixtures ?? [];
  const switchGroups = c.switchGroups ?? [];
  const sockets = c.sockets ?? [];
  if (fixtures.length === 0 && switchGroups.length === 0 && sockets.length === 0) return null;
  return JSON.stringify({
    ...(fixtures.length > 0 ? { fixtures } : {}),
    ...(switchGroups.length > 0 ? { switchGroups } : {}),
    ...(sockets.length > 0 ? { sockets } : {}),
  });
}

export function rowToCircuit(r: CircuitRow): CircuitInput {
  const c: CircuitInput = {
    id: r.id,
    name: r.name,
    role: r.role as CircuitInput['role'],
    loadW: r.loadW,
    cosPhi: r.cosPhi,
    lengthM: r.lengthM,
    loadKind: r.loadKind as CircuitInput['loadKind'],
    isLighting: r.isLighting,
    demandFactor: r.demandFactor,
  };
  const starterType = nullToUndef(r.starterType);
  if (starterType !== undefined) c.starterType = starterType as CircuitInput['starterType'];
  const motorKw = nullToUndef(r.motorKw);
  if (motorKw !== undefined) c.motorKw = motorKw;
  const motorPoles = nullToUndef(r.motorPoles);
  if (motorPoles !== undefined) c.motorPoles = motorPoles;
  const startingDuty = nullToUndef(r.startingDuty);
  if (startingDuty !== undefined) c.startingDuty = startingDuty as CircuitInput['startingDuty'];
  const controlMode = nullToUndef(r.controlMode);
  if (controlMode !== undefined) c.controlMode = controlMode as CircuitInput['controlMode'];
  const sensing = nullToUndef(r.sensing);
  if (sensing !== undefined) c.sensing = sensing as CircuitInput['sensing'];
  const cableOverrideMm2 = nullToUndef(r.cableOverrideMm2);
  if (cableOverrideMm2 !== undefined) c.cableOverrideMm2 = cableOverrideMm2;
  const breakerOverrideA = nullToUndef(r.breakerOverrideA);
  if (breakerOverrideA !== undefined) c.breakerOverrideA = breakerOverrideA;
  if (r.busbarBreakBefore) c.busbarBreakBefore = true;
  const phaseOverride = nullToUndef(r.phaseOverride);
  if (phaseOverride !== undefined) c.phaseOverride = phaseOverride as CircuitInput['phaseOverride'];
  const groupingOverride = nullToUndef(r.groupingOverride);
  if (groupingOverride !== undefined) c.groupingCountOverride = groupingOverride;
  const ssh = nullToUndef(r.scheduleStartHour);
  const seh = nullToUndef(r.scheduleEndHour);
  if (ssh !== undefined && seh !== undefined) c.schedule = { startHour: ssh, endHour: seh };
  const feedsPanelId = nullToUndef(r.feedsPanelId);
  if (feedsPanelId !== undefined) c.feedsPanelId = feedsPanelId;
  if (r.pointsJson) {
    try {
      const points = JSON.parse(r.pointsJson) as Pick<
        CircuitInput,
        'fixtures' | 'switchGroups' | 'sockets'
      >;
      if (points.fixtures) c.fixtures = points.fixtures;
      if (points.switchGroups) c.switchGroups = points.switchGroups;
      if (points.sockets) c.sockets = points.sockets;
    } catch {
      /* corrupt points blob — drop the detail, keep the circuit */
    }
  }
  return c;
}

/** Decode the cached engine result blob, if present and valid. */
export function rowToComputed(r: CircuitRow): CircuitResult | undefined {
  if (!r.computedJson) return undefined;
  try {
    return JSON.parse(r.computedJson) as CircuitResult;
  } catch {
    return undefined;
  }
}

/* --------------------------------- panels --------------------------------- */

export function panelToRow(p: PanelInput, projectId: string): NewPanelRow {
  return {
    id: p.id,
    projectId,
    name: p.name,
    tag: undefToNull(p.tag),
    occupancy: undefToNull(p.occupancy),
    system: p.system,
    voltageV: p.voltageV,
    // frequency is fixed at 50 Hz in the engine model; persist the default.
    frequencyHz: 50,
    ambientTempC: p.ambientTempC,
    installMethod: p.installMethod,
    insulation: undefToNull(p.insulation),
    groupingCount: p.groupingCount,
    activePricelistId: null,
    diversityFactor: p.diversityFactor,
    sourceType: p.sourceType,
    fedByCircuitId: undefToNull(p.fedByCircuitId),
  };
}

export function rowToPanel(r: PanelRow, circuits: CircuitInput[]): PanelInput {
  const p: PanelInput = {
    id: r.id,
    name: r.name,
    system: r.system as PanelInput['system'],
    voltageV: r.voltageV,
    ambientTempC: r.ambientTempC,
    installMethod: r.installMethod as PanelInput['installMethod'],
    groupingCount: r.groupingCount,
    diversityFactor: r.diversityFactor,
    sourceType: r.sourceType as PanelInput['sourceType'],
    circuits,
  };
  const fedBy = nullToUndef(r.fedByCircuitId);
  if (fedBy !== undefined) p.fedByCircuitId = fedBy;
  const tag = nullToUndef(r.tag);
  if (tag !== undefined) p.tag = tag;
  const occupancy = nullToUndef(r.occupancy);
  if (occupancy !== undefined) p.occupancy = occupancy as PanelInput['occupancy'];
  const insulation = nullToUndef(r.insulation);
  if (insulation !== undefined) p.insulation = insulation as PanelInput['insulation'];
  return p;
}

/* -------------------------------- project --------------------------------- */

export function assembleProject(
  id: string,
  name: string,
  panels: PanelInput[],
  earthingSystem?: string | null,
  sourcesJson?: string | null,
  metaJson?: string | null,
  siteJson?: string | null,
): ProjectInput {
  const project: ProjectInput = { id, name, panels };
  const es = nullToUndef(earthingSystem);
  if (es !== undefined) project.earthingSystem = es as ProjectInput['earthingSystem'];
  const sj = nullToUndef(sourcesJson);
  if (sj) {
    try {
      project.sources = JSON.parse(sj) as ProjectInput['sources'];
    } catch {
      /* corrupt sources blob — ignore */
    }
  }
  const mj = nullToUndef(metaJson);
  if (mj) {
    try {
      project.meta = JSON.parse(mj) as ProjectInput['meta'];
    } catch {
      /* corrupt meta blob — ignore */
    }
  }
  const stj = nullToUndef(siteJson);
  if (stj) {
    try {
      project.site = JSON.parse(stj) as ProjectInput['site'];
    } catch {
      /* corrupt site blob — ignore */
    }
  }
  return project;
}
