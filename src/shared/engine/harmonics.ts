/**
 * Harmonics / power-quality analysis (pure).
 *
 * Estimates a panel's harmonic burden from its non-linear loads and recommends
 * mitigation: an oversized neutral for single-phase triplen-harmonic content,
 * and an input line reactor / harmonic filter for 3-phase 6-pulse drives. See
 * `standards/harmonics` for the thresholds and references (IEC 60364-5-52,
 * IEC 61000 / IEEE 519). Results are design estimates, not a measured survey.
 */

import {
  FILTER_FRACTION_THRESHOLD,
  NEUTRAL_OVERSIZE_FRACTION_THRESHOLD,
  REACTOR_FRACTION_THRESHOLD,
  RECOMMENDED_REACTOR_PCT_Z,
  neutralOversizeFactor,
  thdBand,
} from '../standards/harmonics';
import { STANDARD_SECTIONS_MM2 } from '../standards/conductors';
import type { LoadKind } from '../types/electrical';
import type { StarterType } from '../types/control';
import type { HarmonicsResult, Warning } from '../types/results';
import { round } from './util';

/** Per-circuit non-linear summary the engine feeds in (already-demanded W). */
export interface HarmonicLoad {
  /** Effective demand of the circuit (W). */
  loadW: number;
  loadKind: LoadKind;
  starterType?: StarterType;
  /** True when the circuit runs three-phase (set after phase determination). */
  threePhase: boolean;
}

/**
 * Whether a load draws non-linear (harmonic-rich) current: drive-fed motors
 * (VFD), electronically ramped starters (soft-starter), UPS, and welding sets
 * (rectifier front-end). DOL/star-delta/reversing motors are linear inductive
 * loads and are not counted.
 */
export function isNonLinear(loadKind: LoadKind, starterType?: StarterType): boolean {
  if (starterType === 'VFD' || starterType === 'SOFT_STARTER') return true;
  return loadKind === 'ups' || loadKind === 'welding';
}

export interface PanelHarmonicsInput {
  loads: HarmonicLoad[];
  /** Largest neutral CSA across the panel's circuits (mm^2). */
  largestNeutralCsaMm2: number;
}

/**
 * Step a CSA up the standard ladder by a multiplier, returning the smallest
 * standard section that is at least `csa * factor`.
 */
function upsizeCsa(csaMm2: number, factor: number): number {
  const target = csaMm2 * factor;
  return STANDARD_SECTIONS_MM2.find((s) => s >= target) ?? csaMm2;
}

/**
 * Estimate a panel's harmonic burden and mitigation. Returns `undefined` when
 * the panel carries no non-linear load at all (nothing to report).
 */
export function computeHarmonics(i: PanelHarmonicsInput): HarmonicsResult | undefined {
  let totalW = 0;
  let nonLinearW = 0;
  let singlePhaseNonLinearW = 0;
  let threePhaseNonLinearW = 0;
  for (const l of i.loads) {
    const w = Math.max(0, l.loadW);
    totalW += w;
    if (isNonLinear(l.loadKind, l.starterType)) {
      nonLinearW += w;
      if (l.threePhase) threePhaseNonLinearW += w;
      else singlePhaseNonLinearW += w;
    }
  }
  if (nonLinearW <= 0 || totalW <= 0) return undefined;

  const nonLinearFraction = round(nonLinearW / totalW, 3);
  const singlePhaseFraction = round(singlePhaseNonLinearW / totalW, 3);
  const threePhaseFraction = round(threePhaseNonLinearW / totalW, 3);

  // Neutral oversizing for triplen harmonics (single-phase non-linear share).
  const nFactor = round(neutralOversizeFactor(singlePhaseFraction), 2);
  const neutralOversizeNeeded = singlePhaseFraction >= NEUTRAL_OVERSIZE_FRACTION_THRESHOLD;
  const recommendedNeutralCsaMm2 = neutralOversizeNeeded
    ? upsizeCsa(i.largestNeutralCsaMm2, nFactor)
    : i.largestNeutralCsaMm2;

  // 5th/7th mitigation for 3-phase 6-pulse drives (line reactor / filter).
  const reactorRecommended = threePhaseFraction >= REACTOR_FRACTION_THRESHOLD;
  const filterRecommended = nonLinearFraction >= FILTER_FRACTION_THRESHOLD;

  const band = thdBand(nonLinearFraction);

  const notes: string[] = [];
  if (neutralOversizeNeeded) {
    notes.push(
      `Single-phase non-linear load (${Math.round(singlePhaseFraction * 100)}%) raises triplen-harmonic neutral current to ~${nFactor}× phase — use a ${recommendedNeutralCsaMm2} mm² (full/oversized) neutral.`,
    );
  }
  if (reactorRecommended) {
    notes.push(
      `Three-phase 6-pulse drive share (${Math.round(threePhaseFraction * 100)}%) injects 5th/7th harmonics — fit ${RECOMMENDED_REACTOR_PCT_Z}% input line reactors${filterRecommended ? ' and a harmonic filter' : ''}.`,
    );
  } else if (filterRecommended) {
    notes.push('High non-linear load — a harmonic filter is recommended.');
  }
  if (notes.length === 0) {
    notes.push(`Non-linear load ${Math.round(nonLinearFraction * 100)}% of demand — ${band} distortion expected.`);
  }

  return {
    nonLinearFraction,
    neutralOversizeFactor: nFactor,
    recommendedNeutralCsaMm2,
    reactorRecommended,
    reactorPctZ: RECOMMENDED_REACTOR_PCT_Z,
    filterRecommended,
    thdBand: band,
    note: notes.join(' '),
  };
}

/** Raise warnings/info from a panel's harmonics estimate for the warnings pipeline. */
export function harmonicsWarnings(h: HarmonicsResult, panelId?: string): Warning[] {
  const out: Warning[] = [];
  const base = panelId !== undefined ? { panelId } : {};
  if (h.recommendedNeutralCsaMm2 > 0 && h.neutralOversizeFactor > 1) {
    out.push({
      code: 'harmonics-neutral-oversize',
      severity: 'warning',
      message: `Triplen harmonics: oversize the neutral to ${h.recommendedNeutralCsaMm2} mm² (~${h.neutralOversizeFactor}× phase current). ${h.note}`,
      ...base,
    });
  }
  if (h.reactorRecommended || h.filterRecommended) {
    out.push({
      code: 'harmonics-mitigation',
      severity: 'info',
      message: `Harmonic mitigation recommended (${h.thdBand} THD): ${
        h.reactorRecommended ? `${h.reactorPctZ}% input line reactor` : ''
      }${h.reactorRecommended && h.filterRecommended ? ' + ' : ''}${
        h.filterRecommended ? 'harmonic filter' : ''
      }.`,
      ...base,
    });
  }
  return out;
}
