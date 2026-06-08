import { STANDARD_SECTIONS_MM2, baseKha } from '../standards/conductors';
import { CONTACTOR_AC3_FRAMES } from '../standards/control/contactor';
import type { SuggestedFix } from '../types/results';

const SECTIONS: readonly number[] = STANDARD_SECTIONS_MM2;

/** Next standard section strictly larger than `csaMm2`. */
export function nextLargerSection(csaMm2: number): number | undefined {
  return SECTIONS.find((s) => s > csaMm2);
}

/** Smallest section whose derated ampacity meets `izRequired` (>= minSection). */
export function smallestSectionForIz(
  izRequired: number,
  derating: number,
  minSection: number,
): number | undefined {
  const df = derating > 0 ? derating : 1;
  return SECTIONS.find((s) => s >= minSection && baseKha(s) * df >= izRequired);
}

/** Suggest upsizing a cable so its ampacity covers the required current. */
export function suggestCableUpsize(
  currentCsa: number,
  izRequired: number,
  derating: number,
  minSection: number,
): SuggestedFix | undefined {
  const target = smallestSectionForIz(izRequired, derating, minSection) ?? nextLargerSection(currentCsa);
  if (target === undefined || target <= currentCsa) return undefined;
  return {
    description: `Increase cable to ${target} mm² (Iz >= ${Math.round(izRequired)} A after derating)`,
    action: { type: 'set-cable', payload: { csaMm2: target } },
  };
}

/**
 * Suggest a cable upsize to bring voltage drop within the limit. Drop is ~ 1/area
 * (resistance dominated), so the required area scales with drop/limit.
 */
export function suggestCableForVoltageDrop(
  currentCsa: number,
  dropPercent: number,
  limitPercent: number,
): SuggestedFix | undefined {
  if (dropPercent <= limitPercent || limitPercent <= 0) return undefined;
  const requiredCsa = currentCsa * (dropPercent / limitPercent);
  const target = SECTIONS.find((s) => s >= requiredCsa) ?? nextLargerSection(currentCsa);
  if (target === undefined || target <= currentCsa) return undefined;
  return {
    description: `Increase cable to ${target} mm² to bring voltage drop within ${limitPercent}%`,
    action: { type: 'set-cable', payload: { csaMm2: target } },
  };
}

/** Suggest the next contactor frame that covers a target AC-3 current. */
export function suggestContactorUpsize(targetA: number): SuggestedFix | undefined {
  const frame = CONTACTOR_AC3_FRAMES.find((f) => f.ac3A >= targetA);
  if (!frame) return undefined;
  return {
    description: `Use a ${frame.ac3A} A AC-3 contactor (${frame.kw400} kW) to cover ${Math.round(targetA)} A`,
    action: { type: 'set-contactor', payload: { ac3A: frame.ac3A } },
  };
}
