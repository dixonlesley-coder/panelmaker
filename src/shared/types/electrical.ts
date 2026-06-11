/** Core electrical domain vocabulary shared across the engine and UI. */

export type SystemType = '1ph' | '3ph';

export type CableType = 'NYA' | 'NYM' | 'NYY' | 'NYAF' | 'N2XY' | 'NAYY' | 'NA2XY';

/**
 * Conductor insulation family: PVC (70 °C — NYM/NYY) or XLPE (90 °C — N2XY).
 * Drives the ampacity table, the ambient-correction table and the PE adiabatic k.
 */
export type Insulation = 'PVC' | 'XLPE';

/**
 * Conductor material. Aluminum carries ~78% of copper's current at equal
 * section, has ~1.6× the resistance (voltage drop / loop impedance) and a lower
 * adiabatic k — and is only practical from 16 mm² up (NAYY / NA2XY cables).
 */
export type ConductorMaterial = 'Cu' | 'Al';

export type LoadKind =
  | 'general'
  | 'lighting'
  | 'socket'
  | 'heating'
  | 'hvac'
  | 'motor'
  | 'pump'
  | 'ev_charger'
  | 'welding'
  | 'capacitor'
  | 'ups'
  // A reserved way: an installed breaker with no load (good practice keeps
  // 20-30% of a board spare). Contributes no demand; no cable run or RCD.
  | 'spare'
  | 'feeder';

/** Which phase(s) a circuit is connected to. */
export type PhaseAssignment = 'L1' | 'L2' | 'L3' | '3ph';

/** Earthing (grounding) system arrangement. */
export type EarthingSystem = 'TN-S' | 'TN-C-S' | 'TT';

/**
 * Building occupancy class, used to pick standard demand-factor / diversity
 * presets. See `standards/occupancy`.
 */
export type OccupancyType =
  | 'residential'
  | 'office'
  | 'commercial'
  | 'industrial'
  | 'hospitality'
  | 'mixed';

export type InstallMethod = 'conduit' | 'trunking' | 'wall' | 'air' | 'tray' | 'buried';

/** Nominal LV voltages used in Indonesia: 220 V single-phase, 400 V three-phase. */
export const NOMINAL_VOLTAGE: Record<SystemType, number> = {
  '1ph': 220,
  '3ph': 400,
};

export const NOMINAL_FREQUENCY_HZ = 50;
