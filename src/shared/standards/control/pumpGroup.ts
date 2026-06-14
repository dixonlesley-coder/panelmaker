/**
 * Pump-group control schemes. A group of pump circuits is operated together
 * under one of these schemes; each implies the shared control gear (alternator
 * relay, duty controller) and the cross-pump interlock pattern the engine
 * provisions. The level/timer/pressure controller that drives the group is
 * chosen separately (the group's trigger).
 */

import type { PumpGroupMode, PumpGroupTrigger } from '../../types/control';

export type GroupInterlockPattern =
  | 'mutual-exclusion' // only one member energised at a time
  | 'sequence' // members stage in order (k requires k-1)
  | 'none'; // members run independently / together

export interface PumpGroupModeDef {
  mode: PumpGroupMode;
  label: string;
  /** Members may run simultaneously (assist/parallel) vs strictly one at a time. */
  allowsParallel: boolean;
  /** The lead role rotates automatically between cycles (even run hours / wear). */
  alternates: boolean;
  /** Cross-pump interlock pattern the engine enforces between member contactors. */
  interlock: GroupInterlockPattern;
  /** Fewest member pumps for the scheme to be meaningful. */
  minPumps: number;
  description: string;
}

export const PUMP_GROUP_MODES: Readonly<Record<PumpGroupMode, PumpGroupModeDef>> = {
  'single-alternate': {
    mode: 'single-alternate',
    label: 'Single duty / standby (alternating)',
    allowsParallel: false,
    alternates: true,
    interlock: 'mutual-exclusion',
    minPumps: 2,
    description:
      'One pump runs at a time; the duty role alternates each cycle to even out run hours. The standby starts only if the duty fails.',
  },
  'parallel-alternate': {
    mode: 'parallel-alternate',
    label: 'Duty / assist (alternating)',
    allowsParallel: true,
    alternates: true,
    interlock: 'sequence',
    minPumps: 2,
    description:
      'The lead pump runs; further pumps stage in on rising demand and drop out as it falls. The lead role alternates each cycle.',
  },
  'lead-lag': {
    mode: 'lead-lag',
    label: 'Fixed lead / lag (assist)',
    allowsParallel: true,
    alternates: false,
    interlock: 'sequence',
    minPumps: 2,
    description:
      'A fixed lead pump starts first; the lag pump(s) assist on rising demand. No automatic alternation.',
  },
  parallel: {
    mode: 'parallel',
    label: 'Parallel (all together)',
    allowsParallel: true,
    alternates: false,
    interlock: 'none',
    minPumps: 2,
    description: 'All pumps start and stop together on demand — no staging or alternation.',
  },
  cascade: {
    mode: 'cascade',
    label: 'Cascade staging (booster set)',
    allowsParallel: true,
    alternates: true,
    interlock: 'sequence',
    minPumps: 2,
    description:
      'Pumps stage on/off sequentially to hold the setpoint (typically a VFD lead with fixed-speed assists); lead rotates for even wear.',
  },
};

export const PUMP_GROUP_MODE_KEYS = Object.keys(PUMP_GROUP_MODES) as PumpGroupMode[];

export interface PumpGroupTriggerDef {
  trigger: PumpGroupTrigger;
  label: string;
  /** Catalog category of the controller device the trigger provisions, if any. */
  controllerCategory: 'level_relay' | 'timer_relay' | 'pressure_transmitter' | null;
  /** Default device role/label for the controller. */
  controllerRole: string;
  description: string;
}

export const PUMP_GROUP_TRIGGERS: Readonly<Record<PumpGroupTrigger, PumpGroupTriggerDef>> = {
  level: {
    trigger: 'level',
    label: 'Water-level controller',
    controllerCategory: 'level_relay',
    controllerRole: 'group-level-controller',
    description: 'Tank/sump level (float, electrode, pressure or ultrasonic) starts and stops the set.',
  },
  timer: {
    trigger: 'timer',
    label: 'Cyclic timer',
    controllerCategory: 'timer_relay',
    controllerRole: 'group-timer',
    description: 'A repeat-cycle timer runs the set on an ON/OFF schedule (e.g. circulation duty).',
  },
  pressure: {
    trigger: 'pressure',
    label: 'Pressure transmitter',
    controllerCategory: 'pressure_transmitter',
    controllerRole: 'group-pressure-controller',
    description: 'A pressure transmitter / switch holds system pressure by staging the pumps.',
  },
  manual: {
    trigger: 'manual',
    label: 'Manual / BMS',
    controllerCategory: null,
    controllerRole: 'group-run-command',
    description: 'Run command comes from a selector or the BMS; the group only handles staging/alternation.',
  },
};
