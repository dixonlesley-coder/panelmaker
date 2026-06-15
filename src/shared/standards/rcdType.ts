/**
 * Residual-current device (RCD / RCCB / RCBO) **type** selection by waveform
 * sensitivity — orthogonal to the rated residual operating current (mA), which
 * is decided in `engine/grounding.ts` (`circuitRcd`).
 *
 * Standards basis:
 * - IEC 60364-4-41 §531.3.3 — selection of RCD type by the nature of the
 *   residual current the protected circuit can produce.
 * - IEC 62423 — Type F and Type B RCCBs (and their tripping requirements for
 *   smooth DC and high-frequency residual currents).
 * - IEC 61008 / IEC 61009 — Type AC and Type A RCCBs / RCBOs.
 * - PUIL 2011 (Indonesian wiring rules, harmonised with IEC 60364).
 *
 * RCD types, in increasing capability:
 * - **AC** — sinusoidal AC residual current only. **No longer recommended for
 *   general use**: modern circuits almost always contain electronic equipment
 *   that can produce pulsating/DC residual currents which a Type AC device may
 *   fail to detect. Many national rules now effectively forbid it for general
 *   final circuits. Retained here as an enum value for legacy/imported data
 *   only — `recommendedRcdType` NEVER returns it.
 * - **A** — sinusoidal AC + pulsating DC residual currents. The practical
 *   minimum for any circuit feeding electronic loads (the common default).
 * - **F** — Type A capability + residual currents at mixed frequencies (e.g.
 *   single-phase variable-speed drives). IEC 62423.
 * - **B** — Type F capability + smooth (pure) DC residual currents, as produced
 *   by three-phase rectifiers / drives, PV inverters and DC fast charging.
 *   IEC 62423. Required where smooth DC fault current can occur.
 *
 * This module is pure (no Node/DOM/engine deps): a load's nature in → an RCD
 * type recommendation out.
 */

import type { LoadKind } from '../types/electrical';

/** RCD waveform type per IEC 60364-4-41 / IEC 62423 / IEC 61008/61009. */
export type RcdType = 'AC' | 'A' | 'F' | 'B';

/**
 * Capability ordering — a device of higher rank covers every residual-current
 * waveform a lower-ranked device covers (AC ⊂ A ⊂ F ⊂ B). Used to compare /
 * upgrade a recommendation against an existing selection.
 */
export const RCD_TYPE_RANK: Record<RcdType, number> = {
  AC: 0,
  A: 1,
  F: 2,
  B: 3,
};

/** Inputs that determine the residual-current waveform a circuit can produce. */
export interface RecommendedRcdTypeInput {
  /** The circuit's load kind. */
  loadKind: LoadKind;
  /**
   * The circuit is driven by a variable-frequency drive / electronic 3-phase
   * rectifier (a `starterType` of `'VFD'`). These produce smooth DC residual
   * currents → Type B.
   */
  hasVfd?: boolean;
  /**
   * The circuit is an EV supply equipment / charging point. EVSE can produce
   * smooth DC fault current → Type B (or Type A with a 6 mA DC RDC-DD per
   * IEC 62955).
   */
  isEvCharger?: boolean;
}

/**
 * Recommend the minimum-suitable RCD **type** for a circuit from the nature of
 * its load (IEC 60364-4-41 §531.3.3, IEC 62423). Decides the waveform class
 * only — the mA sensitivity is set separately by `circuitRcd`.
 *
 * Type AC is never returned: it is deprecated for general use because modern
 * electronic loads can produce residual currents it may not detect.
 */
export function recommendedRcdType(opts: RecommendedRcdTypeInput): {
  type: RcdType;
  reason: string;
} {
  const { loadKind, hasVfd, isEvCharger } = opts;

  // EV charging: smooth DC fault current possible → Type B, or Type A coupled
  // with a 6 mA DC residual-current detection device (RDC-DD, IEC 62955).
  if (isEvCharger || loadKind === 'ev_charger') {
    return {
      type: 'B',
      reason:
        'EV charging — Type B RCD for smooth DC fault current (IEC 60364-7-722); Type A + 6 mA DC RDC-DD acceptable.',
    };
  }

  // VFD / electronic 3-phase rectifier (variable-speed drive): produces smooth
  // DC residual currents → Type B.
  if (hasVfd) {
    return {
      type: 'B',
      reason:
        'Variable-speed drive / 3-phase rectifier — Type B RCD for smooth DC residual current (IEC 62423).',
    };
  }

  switch (loadKind) {
    // Single-phase electronic-heavy circuits (general outlets, socket circuits,
    // IT and UPS loads): pulsating DC residual current is likely → Type A.
    case 'general':
    case 'socket':
    case 'ups':
      return {
        type: 'A',
        reason:
          'Electronic loads present — Type A RCD for pulsating DC residual current (IEC 60364-4-41 §531.3.3).',
      };

    // Pure resistive / lighting circuits could historically use Type AC, but it
    // is deprecated: even "simple" circuits commonly include LED drivers /
    // electronic ballasts, and Type AC may miss their residual currents.
    case 'lighting':
    case 'heating':
      return {
        type: 'A',
        reason:
          'Type A RCD — Type AC is no longer recommended even for resistive/lighting circuits (electronic drivers/ballasts can produce pulsating DC).',
      };

    // Default for everything else (motors/pumps without a VFD, hvac, welding,
    // capacitor, feeders, etc.): Type A is the safe modern minimum.
    default:
      return {
        type: 'A',
        reason:
          'Type A RCD — modern minimum (Type AC deprecated for general use; IEC 60364-4-41 §531.3.3).',
      };
  }
}
