/**
 * Water-level / pump control template definitions. A pump circuit uses an
 * underlying motor starter (DOL/Star-Delta/Soft-starter/VFD) and layers level
 * sensing, control logic and interlocks on top.
 */

import type { PumpControlMode, LevelSensing } from '../../types/control';

export interface PumpTemplate {
  mode: PumpControlMode;
  label: string;
  /** Start/stop conditions in plain language (drives generated schematic rungs). */
  startCondition: string;
  stopCondition: string;
  /** Sensors required for this scheme (catalog categories/roles). */
  requiredSensors: string[];
  /** Safety interlocks/alarms inherent to the scheme. */
  protections: string[];
}

export const PUMP_TEMPLATES: Readonly<Record<PumpControlMode, PumpTemplate>> = {
  fill: {
    mode: 'fill',
    label: 'Fill (tank from reservoir)',
    startCondition: 'tank level below LOW (E2)',
    stopCondition: 'tank level reaches HIGH (E3)',
    requiredSensors: ['level-relay', 'electrode-assembly', 'source-low-electrode'],
    protections: ['dry-run (source-low NC in series with start)', 'high-high overflow alarm'],
  },
  drain: {
    mode: 'drain',
    label: 'Drain / sump / sewage',
    startCondition: 'sump level reaches HIGH (E3)',
    stopCondition: 'sump level falls below LOW (E2)',
    requiredSensors: ['level-relay', 'electrode-assembly'],
    protections: ['high-high fail alarm', 'discharge check-valve (mechanical)'],
  },
  duplex: {
    mode: 'duplex',
    label: 'Duplex duty / standby (lead-lag)',
    startCondition: 'lead at MED level; lag at HIGH level',
    stopCondition: 'both off below STOP level',
    requiredSensors: ['alternator-relay', 'float-switch-stop', 'float-switch-lead', 'float-switch-lag'],
    protections: ['automatic lead/lag alternation', 'duty-assist on high demand'],
  },
  booster: {
    mode: 'booster',
    label: 'Constant-pressure booster (VFD + PID)',
    startCondition: 'demand / pressure below setpoint',
    stopCondition: 'no-flow / sleep at setpoint',
    requiredSensors: ['pressure-transmitter'],
    protections: ['dry-run / low-suction protection', 'cascade staging for multi-pump'],
  },
};

/** Default level-sensing technology per pump mode. */
export const DEFAULT_SENSING: Readonly<Record<PumpControlMode, LevelSensing>> = {
  fill: 'electrode',
  drain: 'electrode',
  duplex: 'float',
  booster: 'pressure',
};
