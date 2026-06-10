/**
 * Idempotent catalog seeding. Inserts a small starter set of parts (breakers,
 * cables, contactors, a VFD and a level relay) plus a default pricelist when the
 * `parts` table is empty. Re-running is a no-op once seeded.
 */

import type { Part } from '@shared/types/parts';
import { STANDARDS_VERSION } from '@shared/standards/version';
import { SCHNEIDER_CATALOG_PARTS } from '@shared/data/catalog';
import { getDb, type Db } from './connection';
import { insertPartsIfAbsent, partsCount } from '../repositories/parts.repo';
import { importPricelist, listPricelists } from '../repositories/pricelists.repo';

/** Deterministic part factory so seed ids/prices stay stable across runs. */
function part(
  id: string,
  category: Part['category'],
  manufacturer: string,
  model: string,
  attributes: Record<string, unknown>,
  defaultUnit = 'pcs',
): Part {
  return {
    id,
    category,
    manufacturer,
    model,
    attributes,
    defaultUnit,
    standardsVersion: STANDARDS_VERSION,
  };
}

/** The starter catalog. Deterministic ids enable stable pricelist matching. */
export const SEED_PARTS: readonly Part[] = [
  // --- Breakers (MCB/MCCB) ---
  part('seed-mcb-c16', 'breaker', 'Schneider', 'iC60N 1P C16', {
    ratingA: 16,
    poles: 1,
    curve: 'C',
    deviceClass: 'MCB',
    breakingKa: 6,
  }),
  part('seed-mcb-c32', 'breaker', 'Schneider', 'iC60N 3P C32', {
    ratingA: 32,
    poles: 3,
    curve: 'C',
    deviceClass: 'MCB',
    breakingKa: 6,
  }),
  part('seed-mccb-160', 'breaker', 'Schneider', 'NSX160F TM160D', {
    ratingA: 160,
    poles: 3,
    deviceClass: 'MCCB',
    breakingKa: 36,
  }),

  // --- Cables (priced per metre) ---
  part('seed-cable-nyy-4', 'cable', 'Supreme', 'NYY 4x4 mm2', {
    type: 'NYY',
    cores: 4,
    sectionMm2: 4,
  }, 'm'),
  part('seed-cable-nyy-25', 'cable', 'Supreme', 'NYY 4x25 mm2', {
    type: 'NYY',
    cores: 4,
    sectionMm2: 25,
  }, 'm'),
  part('seed-cable-nym-25', 'cable', 'Supreme', 'NYM 3x2.5 mm2', {
    type: 'NYM',
    cores: 3,
    sectionMm2: 2.5,
  }, 'm'),

  // --- Busbar ---
  part('seed-busbar-cu-30x5', 'busbar', 'Generic', 'Cu Flat Bar 30x5', {
    widthMm: 30,
    thicknessMm: 5,
    csaMm2: 150,
    ampacityA: 370,
  }, 'm'),

  // --- Contactors ---
  part('seed-contactor-25', 'contactor', 'Schneider', 'LC1D25 AC-3', {
    ac3A: 25,
    kw400: 11,
    heatLossW: 3.5,
    widthMm: 45,
  }),
  part('seed-contactor-40', 'contactor', 'Schneider', 'LC1D40 AC-3', {
    ac3A: 40,
    kw400: 18.5,
    heatLossW: 4.5,
    widthMm: 55,
  }),

  // --- Overload relay ---
  part('seed-overload-37', 'overload_relay', 'Schneider', 'LRD32 (23-32A)', {
    rangeA: [23, 32],
    tripClass: '10',
    heatLossW: 2.5,
    widthMm: 45,
  }),

  // --- VFD ---
  part('seed-vfd-11kw', 'vfd', 'Schneider', 'ATV320 11kW 400V', {
    kw: 11,
    voltageV: 400,
    outputA: 24.5,
    heatLossW: 320,
    widthMm: 145,
  }),

  // --- Level relay (pump control) ---
  part('seed-level-relay', 'level_relay', 'Omron', '61F-GP-N8', {
    sensing: 'electrode',
    channels: 3,
    heatLossW: 2,
    widthMm: 36,
  }),

  // --- Timers, metering & panel-mount accessories ---
  part('seed-timer-h3dk', 'timer_relay', 'Omron', 'H3DK-M1 Digital Timer', {
    function: 'multifunction',
    rangeS: '0.1s-1200h',
    supplyV: '24-240VAC/DC',
    output: 'DPDT',
    heatLossW: 2,
    widthMm: 22.5,
  }),
  part('seed-ammeter-an96', 'panel_meter', 'Chint', 'Analog Ammeter 96x96 (0-100/5A)', {
    display: 'analog',
    scaleA: '0-100A',
    input: 'CT 100/5A',
    sizeMm: '96x96',
  }),
  part('seed-voltmeter-an96', 'panel_meter', 'Chint', 'Analog Voltmeter 96x96 (0-500V)', {
    display: 'analog',
    scaleV: '0-500V',
    sizeMm: '96x96',
  }),
  part('seed-meter-iem3155', 'panel_meter', 'Schneider', 'iEM3155 Multifunction Meter', {
    measures: 'V/A/kW/kWh/PF/Hz',
    comms: 'Modbus RS-485',
    input: 'CT /5A',
    sizeMm: '96x96',
  }),
  part('seed-ct-100-5', 'current_transformer', 'Schneider', 'CT 100/5A Class 1', {
    primaryA: 100,
    secondaryA: 5,
    burdenVA: 5,
    accuracyClass: '1',
  }),
  part('seed-ct-250-5', 'current_transformer', 'Schneider', 'CT 250/5A Class 1', {
    primaryA: 250,
    secondaryA: 5,
    burdenVA: 5,
    accuracyClass: '1',
  }),
  part('seed-pilot-lamp-red', 'indicator_lamp', 'Schneider', 'Harmony XB7 Pilot Lamp Red 22mm LED', {
    color: 'red',
    type: 'LED',
    voltage: '230VAC',
    diameterMm: 22,
  }),
  part('seed-pilot-lamp-green', 'indicator_lamp', 'Schneider', 'Harmony XB7 Pilot Lamp Green 22mm LED', {
    color: 'green',
    type: 'LED',
    voltage: '230VAC',
    diameterMm: 22,
  }),
  part('seed-pb-start-green', 'pilot_device', 'Schneider', 'Harmony XB7 Push Button Green (1NO)', {
    type: 'push_button',
    color: 'green',
    contacts: '1NO',
    diameterMm: 22,
  }),
  part('seed-pb-stop-red', 'pilot_device', 'Schneider', 'Harmony XB7 Push Button Red (1NC)', {
    type: 'push_button',
    color: 'red',
    contacts: '1NC',
    diameterMm: 22,
  }),
  part('seed-estop-22', 'pilot_device', 'Schneider', 'Harmony Emergency Stop 40mm Turn-Release', {
    type: 'emergency_stop',
    contacts: '1NC',
    diameterMm: 22,
    head: '40mm mushroom',
  }),
  part('seed-selector-3pos', 'pilot_device', 'Schneider', 'Harmony 3-Position Selector Switch', {
    type: 'selector',
    positions: 3,
    contacts: '2NO',
    diameterMm: 22,
  }),
  part('seed-ammeter-selector', 'pilot_device', 'Salzer', 'Ammeter Selector Switch (3ph + N + OFF)', {
    type: 'ammeter_selector',
    positions: 4,
    application: '3-phase ammeter',
  }),
  part('seed-buzzer-22', 'alarm_device', 'Schneider', 'Harmony Panel Buzzer 22mm', {
    type: 'buzzer',
    voltage: '230VAC',
    soundDb: 80,
    diameterMm: 22,
  }),
  part('seed-hour-meter', 'run_hour_meter', 'Omron', 'H7EC Digital Hour Meter', {
    type: 'hour_run',
    display: 'LCD',
    range: '0-9999.9h',
    sizeMm: '48x24',
  }),
];

/** Default IDR pricelist (unit prices in IDR; illustrative, offline). */
const SEED_PRICES: Readonly<Record<string, number>> = {
  'seed-mcb-c16': 95000,
  'seed-mcb-c32': 410000,
  'seed-mccb-160': 2750000,
  'seed-cable-nyy-4': 28000,
  'seed-cable-nyy-25': 165000,
  'seed-cable-nym-25': 12500,
  'seed-busbar-cu-30x5': 480000,
  'seed-contactor-25': 520000,
  'seed-contactor-40': 760000,
  'seed-overload-37': 410000,
  'seed-vfd-11kw': 9850000,
  'seed-level-relay': 690000,
  'seed-timer-h3dk': 385000,
  'seed-ammeter-an96': 165000,
  'seed-voltmeter-an96': 165000,
  'seed-meter-iem3155': 2850000,
  'seed-ct-100-5': 145000,
  'seed-ct-250-5': 175000,
  'seed-pilot-lamp-red': 42000,
  'seed-pilot-lamp-green': 42000,
  'seed-pb-start-green': 58000,
  'seed-pb-stop-red': 58000,
  'seed-estop-22': 135000,
  'seed-selector-3pos': 95000,
  'seed-ammeter-selector': 210000,
  'seed-buzzer-22': 78000,
  'seed-hour-meter': 295000,
};

/**
 * Seed the catalogue. The small starter set + default pricelist seed only into a
 * fresh (empty) DB. The committed manufacturer catalogue
 * ({@link SCHNEIDER_CATALOG_PARTS}) is then upserted on *every* launch — idempotent
 * by SKU — so updating the committed JSON propagates new parts to existing
 * installs without ever clobbering parts/prices the user added themselves.
 */
export function seed(db: Db = getDb()): { partsInserted: number; pricelistCreated: boolean } {
  let partsInserted = 0;
  let pricelistCreated = false;

  if (partsCount(db) === 0) {
    partsInserted += insertPartsIfAbsent([...SEED_PARTS], db);

    if (listPricelists(db).length === 0) {
      const rows = SEED_PARTS.map((p) => ({
        partId: p.id,
        matchKey: p.model,
        unitPrice: SEED_PRICES[p.id] ?? 0,
        currency: 'IDR',
      }));
      importPricelist('Default IDR Catalog', rows, 'IDR', 'seed', db);
      pricelistCreated = true;
    }
  }

  // Manufacturer catalogue: idempotent top-up on every launch (skips existing ids).
  partsInserted += insertPartsIfAbsent([...SCHNEIDER_CATALOG_PARTS], db);

  return { partsInserted, pricelistCreated };
}
