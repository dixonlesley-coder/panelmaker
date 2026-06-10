import { STANDARD_SECTIONS_MM2, baseKha } from '../standards/conductors';
import type { SystemType } from '../types/electrical';
import type { CableResult } from '../types/results';
import { round } from './util';
import { voltageDrop } from './voltageDrop';

/**
 * Optional voltage-drop constraint. When supplied, `sizeCable` upsizes the cable
 * (beyond the ampacity minimum if necessary) so the run's voltage drop also stays
 * within its 3%/5% limit — compliant by construction. The drop is evaluated with
 * the same `designCurrentA` already passed for ampacity, so it matches the live
 * voltage-drop figure the engine recomputes for the chosen section.
 */
export interface CableVoltageDropConstraint {
  lengthM: number;
  cosPhi: number;
  system: SystemType;
  voltageV: number;
  isLighting: boolean;
}

export interface CableSizingInput {
  designCurrentA: number;
  breakerRatingA: number;
  deratingFactor: number;
  /** PUIL minimum section (final circuit 2.5, main/trunk 4). */
  minSectionMm2: number;
  /** When set, also upsize the cable to hold voltage drop within its limit. */
  vd?: CableVoltageDropConstraint;
}

/** PUIL: conductor KHA must be at least 125% of the design current. */
export const CONTINUOUS_FACTOR = 1.25;

/**
 * Smallest standard section whose derated ampacity satisfies both
 * Iz >= In (protection) and Iz >= 1.25 * Ib (PUIL), respecting the minimum
 * section. Guarantees In <= Iz so breaker/cable are coordinated by construction.
 *
 * When a `vd` constraint is supplied the section is additionally upsized until
 * the run's voltage drop is within its 3%/5% limit, so the result is compliant
 * on both ampacity and voltage drop. `vdDriven` flags the (informational) case
 * where the drop limit — not ampacity — forced the larger conductor.
 */
/** Most parallel runs per phase the sizer will propose (practical lugging limit). */
export const PARALLEL_MAX_RUNS = 4;
/**
 * Smallest per-run section allowed in a parallel set (mm²) — parallel small
 * conductors invite unequal current sharing; practice parallels large cables only.
 */
export const PARALLEL_MIN_SECTION_MM2 = 50;

export function sizeCable({
  designCurrentA,
  breakerRatingA,
  deratingFactor,
  minSectionMm2,
  vd,
}: CableSizingInput): CableResult {
  const izRequired = Math.max(breakerRatingA, CONTINUOUS_FACTOR * designCurrentA);
  const df = deratingFactor > 0 ? deratingFactor : 1;

  /** Voltage drop within limit for a per-run candidate (true if unconstrained).
   *  Equal parallel runs share the current, so each run sees Ib / runs. */
  const vdOk = (section: number, runs: number): boolean =>
    vd === undefined ||
    voltageDrop({
      currentA: designCurrentA / runs,
      lengthM: vd.lengthM,
      csaMm2: section,
      cosPhi: vd.cosPhi,
      system: vd.system,
      voltageV: vd.voltageV,
      isLighting: vd.isLighting,
    }).withinLimit;

  const ampacityRule = `Iz {iz}A >= max(In ${breakerRatingA}A, 1.25*Ib ${round(
    CONTINUOUS_FACTOR * designCurrentA,
    1,
  )}A)`;

  // Try a single cable first, then 2..4 equal parallel runs (IEC 60364-5-52
  // §523.7). Within a run count, the smallest section meeting ampacity is noted
  // so a larger pick can be flagged as voltage-drop-driven.
  let anyAmpacityReached = false;
  for (let runs = 1; runs <= PARALLEL_MAX_RUNS; runs++) {
    const minSec = runs === 1 ? minSectionMm2 : Math.max(minSectionMm2, PARALLEL_MIN_SECTION_MM2);
    const izRequiredPerRun = izRequired / runs;
    let ampacityMinSection: number | undefined;

    for (const section of STANDARD_SECTIONS_MM2) {
      if (section < minSec) continue;
      const deratedRun = baseKha(section) * df;
      if (deratedRun < izRequiredPerRun) continue;
      if (ampacityMinSection === undefined) ampacityMinSection = section;
      anyAmpacityReached = true;
      if (!vdOk(section, runs)) continue;

      const vdDriven = section > ampacityMinSection;
      const totalIz = round(deratedRun * runs, 1);
      const rule = ampacityRule.replace('{iz}', String(totalIz));
      return {
        csaMm2: section,
        baseKhaA: baseKha(section),
        deratedIzA: totalIz,
        deratingFactor: round(df, 3),
        ...(runs > 1 ? { runsPerPhase: runs } : {}),
        vdDriven,
        appliedRule:
          (runs > 1 ? `${runs}× parallel runs — ` : '') +
          (vdDriven ? `${rule}; upsized to hold Vd <= ${vd!.isLighting ? 3 : 5}%` : rule),
      };
    }
  }

  // Nothing satisfied both constraints even at 4 parallel runs. Distinguish:
  //   - ampacity itself unreachable (no run count carries the load), vs.
  //   - ampacity met but the Vd limit unreachable (still adequately protected —
  //     conductor sizing alone can't fix the drop).
  const largest = STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1]!;
  const ampacityImpossible = !anyAmpacityReached;
  return {
    csaMm2: largest,
    baseKhaA: baseKha(largest),
    deratedIzA: round(baseKha(largest) * df * PARALLEL_MAX_RUNS, 1),
    deratingFactor: round(df, 3),
    runsPerPhase: PARALLEL_MAX_RUNS,
    vdDriven: !ampacityImpossible,
    appliedRule: ampacityImpossible
      ? `exceeds-range: ${PARALLEL_MAX_RUNS}× largest standard section still below required Iz`
      : 'voltage-drop-exceeds-range: largest standard section still over the Vd limit',
  };
}
