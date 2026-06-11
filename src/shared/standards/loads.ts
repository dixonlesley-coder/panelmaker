/**
 * Load-type catalog: typical electrical characteristics and design defaults per
 * kind of load. Drives power-factor / demand-factor defaults, breaker trip
 * curve, and whether a load is naturally three-phase or motor-like.
 */

import type { LoadKind } from '../types/electrical';
import type { BreakerCurve } from './protection';

export interface LoadDefaults {
  label: string;
  /** Typical power factor. */
  cosPhi: number;
  /** Typical demand/utilisation factor (0-1). */
  demandFactor: number;
  /** Preferred breaker trip curve. */
  curve: BreakerCurve;
  /** Larger ratings of this load are normally supplied three-phase. */
  threePhasePreferred: boolean;
  /** Behaves like a motor (high inrush) for protection purposes. */
  motorLike: boolean;
  /**
   * Whether the load uses a neutral conductor. Lighting fixtures and pure
   * line-to-line loads run without one (2-core L+PE single-phase / 4-core
   * 3L+PE three-phase); loads with a neutral get the extra core.
   */
  needsNeutral: boolean;
}

export const LOAD_DEFAULTS: Readonly<Record<LoadKind, LoadDefaults>> = {
  general: { label: 'General', cosPhi: 0.85, demandFactor: 1, curve: 'C', threePhasePreferred: false, motorLike: false, needsNeutral: true },
  lighting: { label: 'Lighting', cosPhi: 0.9, demandFactor: 1, curve: 'B', threePhasePreferred: false, motorLike: false, needsNeutral: true },
  socket: { label: 'Socket outlets', cosPhi: 0.9, demandFactor: 0.7, curve: 'C', threePhasePreferred: false, motorLike: false, needsNeutral: true },
  heating: { label: 'Heating / resistive', cosPhi: 1.0, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false, needsNeutral: false },
  hvac: { label: 'HVAC / air-con', cosPhi: 0.85, demandFactor: 0.9, curve: 'C', threePhasePreferred: true, motorLike: true, needsNeutral: true },
  motor: { label: 'Motor', cosPhi: 0.85, demandFactor: 1, curve: 'D', threePhasePreferred: true, motorLike: true, needsNeutral: false },
  pump: { label: 'Pump', cosPhi: 0.85, demandFactor: 1, curve: 'D', threePhasePreferred: true, motorLike: true, needsNeutral: false },
  ev_charger: { label: 'EV charger', cosPhi: 0.98, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false, needsNeutral: true },
  welding: { label: 'Welding', cosPhi: 0.7, demandFactor: 0.5, curve: 'D', threePhasePreferred: true, motorLike: false, needsNeutral: true },
  capacitor: { label: 'Capacitor bank', cosPhi: 1.0, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false, needsNeutral: false },
  ups: { label: 'UPS', cosPhi: 0.9, demandFactor: 1, curve: 'C', threePhasePreferred: false, motorLike: false, needsNeutral: true },
  spare: { label: 'Spare way', cosPhi: 1.0, demandFactor: 0, curve: 'C', threePhasePreferred: false, motorLike: false, needsNeutral: true },
  feeder: { label: 'Feeder (sub-panel)', cosPhi: 0.85, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false, needsNeutral: true },
};

/** Order of load kinds for UI pickers. */
export const LOAD_KINDS: readonly LoadKind[] = [
  'general',
  'lighting',
  'socket',
  'heating',
  'hvac',
  'motor',
  'pump',
  'ev_charger',
  'welding',
  'capacitor',
  'ups',
  'spare',
  'feeder',
];

/**
 * Practical ceiling (W) for a single-phase final circuit before three-phase is
 * preferred. Indonesian single-phase residential service tops out around
 * 5.5 kVA; beyond that loads move to three-phase.
 */
export const SINGLE_PHASE_MAX_W = 5500;

/** Motors at/above this rating (kW) are normally three-phase. */
export const MOTOR_THREE_PHASE_KW = 3;
