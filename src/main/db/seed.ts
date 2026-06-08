/**
 * Idempotent catalog seeding. Inserts a small starter set of parts (breakers,
 * cables, contactors, a VFD and a level relay) plus a default pricelist when the
 * `parts` table is empty. Re-running is a no-op once seeded.
 */

import type { Part } from '@shared/types/parts';
import { STANDARDS_VERSION } from '@shared/standards/version';
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
};

/** Insert the starter catalog + default pricelist when the DB is empty. */
export function seed(db: Db = getDb()): { partsInserted: number; pricelistCreated: boolean } {
  if (partsCount(db) > 0) {
    return { partsInserted: 0, pricelistCreated: false };
  }

  const partsInserted = insertPartsIfAbsent([...SEED_PARTS], db);

  let pricelistCreated = false;
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

  return { partsInserted, pricelistCreated };
}
