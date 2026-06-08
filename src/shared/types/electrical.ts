/** Core electrical domain vocabulary shared across the engine and UI. */

export type SystemType = '1ph' | '3ph';

export type CableType = 'NYA' | 'NYM' | 'NYY' | 'NYAF';

export type LoadKind = 'general' | 'lighting' | 'motor' | 'pump' | 'feeder';

export type InstallMethod = 'conduit' | 'trunking' | 'wall' | 'air' | 'tray' | 'buried';

/** Nominal LV voltages used in Indonesia: 220 V single-phase, 400 V three-phase. */
export const NOMINAL_VOLTAGE: Record<SystemType, number> = {
  '1ph': 220,
  '3ph': 400,
};

export const NOMINAL_FREQUENCY_HZ = 50;
