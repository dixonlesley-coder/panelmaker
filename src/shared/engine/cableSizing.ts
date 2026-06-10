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
export function sizeCable({
  designCurrentA,
  breakerRatingA,
  deratingFactor,
  minSectionMm2,
  vd,
}: CableSizingInput): CableResult {
  const izRequired = Math.max(breakerRatingA, CONTINUOUS_FACTOR * designCurrentA);
  const df = deratingFactor > 0 ? deratingFactor : 1;

  /** Voltage drop within its limit for a candidate section (true if unconstrained). */
  const vdOk = (section: number): boolean =>
    vd === undefined ||
    voltageDrop({
      currentA: designCurrentA,
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

  // First section meeting ampacity (regardless of Vd) — lets us tell when the
  // voltage-drop limit, not ampacity, is what forced a larger conductor.
  let ampacityMinSection: number | undefined;

  for (const section of STANDARD_SECTIONS_MM2) {
    if (section < minSectionMm2) continue;
    const derated = baseKha(section) * df;
    if (derated < izRequired) continue;
    if (ampacityMinSection === undefined) ampacityMinSection = section;
    if (!vdOk(section)) continue;

    const vdDriven = section > ampacityMinSection;
    const izStr = round(derated, 1);
    return {
      csaMm2: section,
      baseKhaA: baseKha(section),
      deratedIzA: izStr,
      deratingFactor: round(df, 3),
      vdDriven,
      appliedRule: vdDriven
        ? `${ampacityRule.replace('{iz}', String(izStr))}; upsized to hold Vd <= ${
            vd!.isLighting ? 3 : 5
          }%`
        : ampacityRule.replace('{iz}', String(izStr)),
    };
  }

  // Nothing satisfied both constraints. Distinguish the two failure modes:
  //   - ampacity itself unreachable (no section carries the load), vs.
  //   - ampacity met but the Vd limit unreachable even at the largest section
  //     (still adequately protected — cable sizing alone can't fix the drop).
  const largest = STANDARD_SECTIONS_MM2[STANDARD_SECTIONS_MM2.length - 1]!;
  const ampacityImpossible = ampacityMinSection === undefined;
  return {
    csaMm2: largest,
    baseKhaA: baseKha(largest),
    deratedIzA: round(baseKha(largest) * df, 1),
    deratingFactor: round(df, 3),
    vdDriven: !ampacityImpossible,
    appliedRule: ampacityImpossible
      ? 'exceeds-range: largest standard section still below required Iz'
      : 'voltage-drop-exceeds-range: largest standard section still over the Vd limit',
  };
}
