/**
 * Final-circuit point engine (pure): derives a lighting/socket circuit's
 * connected load from its fixture/outlet points and checks the switching
 * arrangement — per-gang/channel load limits, unswitched fixtures, smart-module
 * neutral requirements and the conventional point-count practice limits.
 *
 * See `standards/fixtures` for the reference values, and `types/fixtures` for
 * the input shapes carried on `CircuitInput`.
 */

import {
  FIXTURES_CLAUSE,
  MAX_POINTS_PER_LIGHTING_CIRCUIT,
  MAX_POINTS_PER_SOCKET_CIRCUIT,
  MAX_W_PER_CONVENTIONAL_GANG,
  MAX_W_PER_SMART_CHANNEL,
  SMART_PROTOCOL_LABELS,
  VA_PER_SOCKET_POINT,
} from '../standards/fixtures';
import type { CircuitInput } from '../types/project';
import type { SwitchKind } from '../types/fixtures';
import type { Warning } from '../types/results';
import { round } from './util';

/** Computed loading of one switch group (gang/channel). */
export interface SwitchGroupLoad {
  groupId: string;
  label: string;
  kind: SwitchKind;
  /** Display detail: "2-gang, 2-way" or "Smart (Wi-Fi)". */
  detail: string;
  /** Fittings controlled by this group. */
  fixtureCount: number;
  /** Controlled load (W). */
  loadW: number;
  /** Recommended ceiling for this kind of switching point (W). */
  maxRecommendedW: number;
  /** True when the controlled load exceeds the recommended ceiling. */
  overloaded: boolean;
  /** True for a smart module declared to have no neutral at the switch point. */
  needsNeutralNote: boolean;
}

/** A fixture/socket row carried into the result (for schedules and the BOM). */
export interface PointRow {
  name: string;
  qty: number;
  /** Watts per fitting (lighting rows only). */
  wattsPerFitting?: number;
}

/** Point-level summary of a final circuit, attached to its CircuitResult. */
export interface FinalCircuitResult {
  kind: 'lighting' | 'socket';
  /** Total fittings (lighting) or outlet points (sockets). */
  pointCount: number;
  /** Connected load derived from the points (W). */
  derivedLoadW: number;
  /** Fixture/outlet rows (for the schedule and BOM). */
  rows: PointRow[];
  /** Switching points and their loading (lighting only). */
  switchGroups: SwitchGroupLoad[];
  /** Fittings not assigned to any switch group (permanently live). */
  unswitchedFixtures: number;
  /** Conventional practice limit for points on this final circuit. */
  pointLimit: number;
  /** True when the circuit carries more points than the practice limit. */
  tooManyPoints: boolean;
  /** Governing references. */
  clause: string;
}

/**
 * The circuit's connected load derived from its points (W), or undefined when
 * the circuit carries no point detail (the flat `loadW` then applies):
 *   - lighting: Σ wattsPerFitting × qty over the fixture rows;
 *   - sockets: Σ qty × the row's planned VA per point — each row's own
 *     `vaPerPoint` when set (dedicated/heavy outlets), else the standard
 *     planning value.
 */
export function derivedPointsLoadW(c: CircuitInput): number | undefined {
  const fixtures = c.fixtures ?? [];
  const sockets = c.sockets ?? [];
  if (fixtures.length === 0 && sockets.length === 0) return undefined;
  const fixtureW = fixtures.reduce(
    (sum, f) => sum + Math.max(0, f.wattsPerFitting) * Math.max(0, f.qty),
    0,
  );
  const socketW = sockets.reduce(
    (sum, s) => sum + Math.max(0, s.qty) * Math.max(0, s.vaPerPoint ?? VA_PER_SOCKET_POINT),
    0,
  );
  return round(fixtureW + socketW, 0);
}

/** Display detail for a switch group. */
function groupDetail(kind: SwitchKind, gang?: number, ways?: number, protocol?: string): string {
  if (kind === 'smart') {
    const label = protocol
      ? (SMART_PROTOCOL_LABELS[protocol as keyof typeof SMART_PROTOCOL_LABELS] ?? protocol)
      : 'smart';
    return `Smart (${label})`;
  }
  const g = gang && gang > 1 ? `${gang}-gang` : '1-gang';
  return ways === 2 ? `${g}, 2-way` : g;
}

/**
 * Summarize a final circuit's points and switching, or undefined when the
 * circuit carries no point detail.
 */
export function summarizeFinalCircuit(c: CircuitInput): FinalCircuitResult | undefined {
  const fixtures = c.fixtures ?? [];
  const sockets = c.sockets ?? [];
  if (fixtures.length === 0 && sockets.length === 0) return undefined;

  const isLightingDetail = fixtures.length > 0;
  const fixturePoints = fixtures.reduce((n, f) => n + Math.max(0, f.qty), 0);
  const socketPoints = sockets.reduce((n, s) => n + Math.max(0, s.qty), 0);
  const pointCount = fixturePoints + socketPoints;

  // Per-switch-group controlled load.
  const groups: SwitchGroupLoad[] = (c.switchGroups ?? []).map((g) => {
    const controlled = fixtures.filter((f) => f.switchGroupId === g.id);
    const loadW = round(
      controlled.reduce((sum, f) => sum + Math.max(0, f.wattsPerFitting) * Math.max(0, f.qty), 0),
      0,
    );
    const maxRecommendedW =
      g.kind === 'smart' ? MAX_W_PER_SMART_CHANNEL : MAX_W_PER_CONVENTIONAL_GANG * (g.gang ?? 1);
    return {
      groupId: g.id,
      label: g.label,
      kind: g.kind,
      detail: groupDetail(g.kind, g.gang, g.ways, g.protocol),
      fixtureCount: controlled.reduce((n, f) => n + Math.max(0, f.qty), 0),
      loadW,
      maxRecommendedW,
      overloaded: loadW > maxRecommendedW + 1e-9,
      needsNeutralNote: g.kind === 'smart' && g.neutralAtSwitch === false,
    };
  });

  const groupIds = new Set((c.switchGroups ?? []).map((g) => g.id));
  const unswitchedFixtures = fixtures
    .filter((f) => f.switchGroupId === undefined || !groupIds.has(f.switchGroupId))
    .reduce((n, f) => n + Math.max(0, f.qty), 0);

  const pointLimit = isLightingDetail
    ? MAX_POINTS_PER_LIGHTING_CIRCUIT
    : MAX_POINTS_PER_SOCKET_CIRCUIT;

  return {
    kind: isLightingDetail ? 'lighting' : 'socket',
    pointCount,
    derivedLoadW: derivedPointsLoadW(c) ?? 0,
    rows: [
      ...fixtures.map((f) => ({ name: f.name, qty: f.qty, wattsPerFitting: f.wattsPerFitting })),
      ...sockets.map((s) => ({ name: s.name, qty: s.qty })),
    ],
    switchGroups: groups,
    unswitchedFixtures,
    pointLimit,
    tooManyPoints: pointCount > pointLimit,
    clause: FIXTURES_CLAUSE,
  };
}

/** Rule-violation warnings for a summarized final circuit. */
export function finalCircuitWarnings(
  summary: FinalCircuitResult,
  circuit: { id: string; name: string },
  panelId?: string,
): Warning[] {
  const out: Warning[] = [];
  const base = { panelId, circuitId: circuit.id };

  if (summary.tooManyPoints) {
    out.push({
      code: 'too-many-points',
      severity: 'warning',
      message: `${circuit.name}: ${summary.pointCount} points exceed the recommended ${summary.pointLimit} per final circuit — split onto another circuit.`,
      ...base,
    });
  }

  for (const g of summary.switchGroups) {
    if (g.overloaded) {
      out.push({
        code: 'switch-group-overloaded',
        severity: 'warning',
        message: `${circuit.name}: switch "${g.label}" (${g.detail}) controls ${g.loadW} W — above the recommended ${g.maxRecommendedW} W; split the fixtures across more gangs/channels.`,
        ...base,
      });
    }
    if (g.needsNeutralNote) {
      out.push({
        code: 'smart-switch-no-neutral',
        severity: 'info',
        message: `${circuit.name}: smart switch "${g.label}" has no neutral at the switch point — use a no-neutral module or pull a neutral to the box.`,
        ...base,
      });
    }
  }

  if (summary.kind === 'lighting' && summary.unswitchedFixtures > 0) {
    out.push({
      code: 'unswitched-fixtures',
      severity: 'info',
      message: `${circuit.name}: ${summary.unswitchedFixtures} fitting(s) not assigned to any switch — they will be permanently live.`,
      ...base,
    });
  }

  return out;
}
