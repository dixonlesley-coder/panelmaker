import { LOAD_DEFAULTS, SINGLE_PHASE_MAX_W, MOTOR_THREE_PHASE_KW } from '../standards/loads';
import type { LoadKind, PhaseAssignment, SystemType } from '../types/electrical';
import type { PhaseBalanceResult } from '../types/results';
import { round } from './util';

export interface ThreePhaseInput {
  panelSystem: SystemType;
  kind: LoadKind;
  loadW: number;
  motorKw?: number;
  hasStarter?: boolean;
  isFeeder?: boolean;
}

/**
 * Whether a circuit is supplied three-phase. On a single-phase panel everything
 * is single-phase. On a three-phase panel: feeders and large/motor loads are
 * three-phase; small loads stay single-phase (and get phase-balanced).
 */
export function circuitIsThreePhase(i: ThreePhaseInput): boolean {
  if (i.panelSystem === '1ph') return false;
  if (i.isFeeder || i.kind === 'feeder') return true;
  const def = LOAD_DEFAULTS[i.kind];
  if (def.motorLike) {
    const kw = i.motorKw ?? i.loadW / 1000;
    return kw >= MOTOR_THREE_PHASE_KW || Boolean(i.hasStarter);
  }
  return i.loadW > SINGLE_PHASE_MAX_W;
}

/** Recommend a supply configuration for a standalone load. */
export function recommendPhase(kind: LoadKind, loadW: number, motorKw?: number): SystemType {
  return circuitIsThreePhase({ panelSystem: '3ph', kind, loadW, motorKw }) ? '3ph' : '1ph';
}

export interface PhaseCircuit {
  id: string;
  threePhase: boolean;
  currentA: number;
  /** User-pinned line for a single-phase circuit — excluded from auto-balancing. */
  pinned?: 'L1' | 'L2' | 'L3';
}

export interface PhaseBalance extends PhaseBalanceResult {
  assignment: Record<string, PhaseAssignment>;
}

/**
 * Distribute single-phase circuits across L1/L2/L3 (greedy least-loaded) while
 * three-phase circuits load all phases equally, then report per-phase line
 * current and the imbalance percentage. User-pinned circuits keep their line —
 * they are loaded first, and only the unpinned remainder is auto-balanced, so
 * phase labels stay stable on an as-built schedule.
 */
export function balancePhases(circuits: PhaseCircuit[], panelSystem: SystemType): PhaseBalance {
  const phases = { L1: 0, L2: 0, L3: 0 };
  const assignment: Record<string, PhaseAssignment> = {};

  if (panelSystem === '1ph') {
    for (const c of circuits) {
      phases.L1 += c.currentA;
      assignment[c.id] = 'L1';
    }
    return { L1: round(phases.L1, 1), L2: 0, L3: 0, imbalancePct: 0, assignment };
  }

  for (const c of circuits) {
    if (c.threePhase) {
      phases.L1 += c.currentA;
      phases.L2 += c.currentA;
      phases.L3 += c.currentA;
      assignment[c.id] = '3ph';
    }
  }

  // Pinned single-phase circuits load their line first, verbatim.
  for (const c of circuits) {
    if (c.threePhase || !c.pinned) continue;
    phases[c.pinned] += c.currentA;
    assignment[c.id] = c.pinned;
  }

  const keys = ['L1', 'L2', 'L3'] as const;
  type Line = (typeof keys)[number];
  const singles = circuits
    .filter((c) => !c.threePhase && !c.pinned)
    .sort((a, b) => b.currentA - a.currentA);
  for (const c of singles) {
    const min = keys.reduce<Line>((m, p) => (phases[p] < phases[m] ? p : m), 'L1');
    phases[min] += c.currentA;
    assignment[c.id] = min;
  }

  // Local-search refinement: greedy LPT can leave a lumpy load set unbalanced, so
  // relocate / swap the movable single-phase circuits while it shrinks the
  // L1/L2/L3 spread. Only the unpinned singles move; pinned + 3-phase stay put.
  const spread = () => Math.max(phases.L1, phases.L2, phases.L3) - Math.min(phases.L1, phases.L2, phases.L3);
  for (let pass = 0; pass < 40; pass++) {
    let improved = false;
    for (const c of singles) {
      const from = assignment[c.id] as Line;
      for (const to of keys) {
        if (to === from) continue;
        const before = spread();
        phases[from] -= c.currentA;
        phases[to] += c.currentA;
        if (spread() < before - 1e-9) {
          assignment[c.id] = to;
          improved = true;
        } else {
          phases[from] += c.currentA;
          phases[to] -= c.currentA;
        }
      }
    }
    for (const a of singles) {
      for (const b of singles) {
        const pa = assignment[a.id] as Line;
        const pb = assignment[b.id] as Line;
        if (a.id === b.id || pa === pb) continue;
        const before = spread();
        phases[pa] += b.currentA - a.currentA;
        phases[pb] += a.currentA - b.currentA;
        if (spread() < before - 1e-9) {
          assignment[a.id] = pb;
          assignment[b.id] = pa;
          improved = true;
        } else {
          phases[pa] -= b.currentA - a.currentA;
          phases[pb] -= a.currentA - b.currentA;
        }
      }
    }
    if (!improved) break;
  }

  const vals = [phases.L1, phases.L2, phases.L3];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const avg = (vals[0]! + vals[1]! + vals[2]!) / 3;
  const imbalancePct = avg > 0 ? ((max - min) / avg) * 100 : 0;

  return {
    L1: round(phases.L1, 1),
    L2: round(phases.L2, 1),
    L3: round(phases.L3, 1),
    imbalancePct: round(imbalancePct, 1),
    assignment,
  };
}
