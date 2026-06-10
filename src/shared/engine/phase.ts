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

  const singles = circuits
    .filter((c) => !c.threePhase && !c.pinned)
    .sort((a, b) => b.currentA - a.currentA);
  const keys = ['L1', 'L2', 'L3'] as const;
  for (const c of singles) {
    const min = keys.reduce((m, p) => (phases[p] < phases[m] ? p : m), 'L1' as 'L1' | 'L2' | 'L3');
    phases[min] += c.currentA;
    assignment[c.id] = min;
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
