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
}

export const LOAD_DEFAULTS: Readonly<Record<LoadKind, LoadDefaults>> = {
  general: { label: 'General', cosPhi: 0.85, demandFactor: 1, curve: 'C', threePhasePreferred: false, motorLike: false },
  lighting: { label: 'Lighting', cosPhi: 0.9, demandFactor: 1, curve: 'B', threePhasePreferred: false, motorLike: false },
  socket: { label: 'Socket outlets', cosPhi: 0.9, demandFactor: 0.7, curve: 'C', threePhasePreferred: false, motorLike: false },
  heating: { label: 'Heating / resistive', cosPhi: 1.0, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false },
  hvac: { label: 'HVAC / air-con', cosPhi: 0.85, demandFactor: 0.9, curve: 'C', threePhasePreferred: true, motorLike: true },
  motor: { label: 'Motor', cosPhi: 0.85, demandFactor: 1, curve: 'D', threePhasePreferred: true, motorLike: true },
  pump: { label: 'Pump', cosPhi: 0.85, demandFactor: 1, curve: 'D', threePhasePreferred: true, motorLike: true },
  ev_charger: { label: 'EV charger', cosPhi: 0.98, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false },
  welding: { label: 'Welding', cosPhi: 0.7, demandFactor: 0.5, curve: 'D', threePhasePreferred: true, motorLike: false },
  capacitor: { label: 'Capacitor bank', cosPhi: 1.0, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false },
  ups: { label: 'UPS', cosPhi: 0.9, demandFactor: 1, curve: 'C', threePhasePreferred: false, motorLike: false },
  feeder: { label: 'Feeder (sub-panel)', cosPhi: 0.85, demandFactor: 1, curve: 'C', threePhasePreferred: true, motorLike: false },
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
