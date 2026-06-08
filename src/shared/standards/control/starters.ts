/**
 * Data-driven starter template definitions. Each describes the gear a starter
 * needs and the interlocks it requires; the engine (`applyStarterTemplate`)
 * interprets these to produce a sized control assembly. Adding a starter type
 * is adding a definition here — no new control-flow code.
 */

import type { StarterTemplateDef } from '../../types/control';

export const STARTER_TEMPLATES: Readonly<Record<string, StarterTemplateDef>> = {
  DOL: {
    type: 'DOL',
    label: 'Direct-On-Line',
    suitedKwRange: [0.37, 5.5],
    controlTransformerRequired: false,
    deviceSlots: [
      { role: 'main-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'overload', category: 'overload_relay', sizing: 'overload-flc' },
      { role: 'start-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'stop-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'run-lamp', category: 'indicator_lamp', sizing: 'pilot' },
    ],
    interlocks: [],
  },

  STAR_DELTA: {
    type: 'STAR_DELTA',
    label: 'Star-Delta (Y-Δ)',
    suitedKwRange: [7.5, 55],
    controlTransformerRequired: true,
    deviceSlots: [
      { role: 'main-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'delta-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'star-contactor', category: 'contactor', sizing: 'ac3-star-winding' },
      { role: 'overload', category: 'overload_relay', sizing: 'overload-star-flc' },
      { role: 'star-delta-timer', category: 'timer_relay', sizing: 'pilot' },
      { role: 'start-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'stop-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'run-lamp', category: 'indicator_lamp', sizing: 'pilot' },
    ],
    interlocks: [
      {
        kind: 'mechanical',
        roleA: 'star-contactor',
        roleB: 'delta-contactor',
        relation: 'mutual_exclusion',
        note: 'Star and delta must never close together (phase-to-phase short).',
      },
      {
        kind: 'electrical',
        roleA: 'star-contactor',
        roleB: 'delta-contactor',
        relation: 'mutual_exclusion',
        note: 'Cross-wired NC auxiliaries as redundant interlock.',
      },
    ],
  },

  REVERSING: {
    type: 'REVERSING',
    label: 'Reversing (Fwd/Rev)',
    suitedKwRange: [0.37, 30],
    controlTransformerRequired: false,
    deviceSlots: [
      { role: 'forward-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'reverse-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'overload', category: 'overload_relay', sizing: 'overload-flc' },
      { role: 'fwd-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'rev-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'stop-pb', category: 'pilot_device', sizing: 'pilot' },
    ],
    interlocks: [
      {
        kind: 'mechanical',
        roleA: 'forward-contactor',
        roleB: 'reverse-contactor',
        relation: 'mutual_exclusion',
        note: 'Forward and reverse must never close together.',
      },
      {
        kind: 'electrical',
        roleA: 'forward-contactor',
        roleB: 'reverse-contactor',
        relation: 'mutual_exclusion',
      },
    ],
  },

  SOFT_STARTER: {
    type: 'SOFT_STARTER',
    label: 'Soft Starter',
    suitedKwRange: [5.5, 250],
    controlTransformerRequired: false,
    deviceSlots: [
      { role: 'soft-starter', category: 'soft_starter', sizing: 'vfd-output' },
      { role: 'bypass-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'overload', category: 'overload_relay', sizing: 'overload-flc' },
      { role: 'start-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'stop-pb', category: 'pilot_device', sizing: 'pilot' },
    ],
    interlocks: [],
  },

  VFD: {
    type: 'VFD',
    label: 'Variable Frequency Drive',
    suitedKwRange: [0.37, 250],
    controlTransformerRequired: false,
    deviceSlots: [
      { role: 'drive', category: 'vfd', sizing: 'vfd-output' },
      { role: 'input-mccb', category: 'breaker', sizing: 'ac3-full-flc' },
      { role: 'speed-pot', category: 'pilot_device', sizing: 'pilot' },
      { role: 'start-pb', category: 'pilot_device', sizing: 'pilot' },
      { role: 'stop-pb', category: 'pilot_device', sizing: 'pilot' },
    ],
    interlocks: [],
  },

  ATS: {
    type: 'ATS',
    label: 'Automatic Transfer Switch',
    controlTransformerRequired: true,
    deviceSlots: [
      { role: 'mains-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'genset-contactor', category: 'contactor', sizing: 'ac3-full-flc' },
      { role: 'mains-failure-relay', category: 'phase_protection_relay', sizing: 'pilot' },
    ],
    interlocks: [
      {
        kind: 'mechanical',
        roleA: 'mains-contactor',
        roleB: 'genset-contactor',
        relation: 'mutual_exclusion',
        note: 'Mains and genset sources must never be paralleled.',
      },
      {
        kind: 'electrical',
        roleA: 'mains-contactor',
        roleB: 'genset-contactor',
        relation: 'mutual_exclusion',
      },
    ],
  },
};

export function starterTemplate(type: string): StarterTemplateDef | undefined {
  return STARTER_TEMPLATES[type];
}
