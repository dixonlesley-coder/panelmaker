/**
 * Schneider Electric — representative catalog families.
 *
 * Real, public product-line names (Acti9, ComPacT NSX, TeSys) used nominatively
 * with STANDARD IEC rating ladders. Breaking-capacity tiers are the well-known
 * standard values for each series; everything here is REPRESENTATIVE and must be
 * verified against the manufacturer datasheet (exact catalogue number, Icu, price).
 */

import type { CatalogFamily } from './types';

/** Shared verification reminder appended to every family note. */
const VERIFY =
  'Representative ratings — verify exact catalogue number, Icu and price against the manufacturer datasheet.';

/** Standard IEC 60898 MCB rated-current ladder (A). */
const MCB_LADDER = [6, 10, 16, 20, 25, 32, 40, 50, 63];

/** Standard ComPacT NSX frame ratings (A). */
const NSX_FRAMES = [16, 25, 40, 63, 100, 160, 250, 400, 630];

/** Standard AC-3 rated currents (A) for the TeSys D / Deca contactor range. */
const TESYS_AC3 = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95, 115, 150];

/** Schneider Electric representative families. */
export const schneider: CatalogFamily[] = [
  {
    manufacturer: 'Schneider Electric',
    series: 'Acti9 iC60N',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 6,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Final-circuit MCB, ~6 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'A9F …',
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'Acti9 iC60H',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 10,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Higher breaking-capacity MCB, ~10 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'A9F …',
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'ComPacT NSX',
    kind: 'mccb',
    ratingsA: [...NSX_FRAMES],
    poles: [3, 4],
    breakingKa: 36,
    curves: undefined,
    representative: true,
    note: `MCCB frames 16–630 A; breaking class depends on the F/N/H/S/L variant (~36–50 kA tier). ${VERIFY}`,
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'TeSys Deca / D',
    kind: 'contactor',
    ratingsA: [...TESYS_AC3],
    poles: [3],
    representative: true,
    note: `Power contactor, AC-3 rated currents. ${VERIFY}`,
    orderCodeHint: 'LC1D…',
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'TeSys Deca / D thermal overload (LRD)',
    kind: 'overload_relay',
    ratingsA: [...TESYS_AC3],
    poles: [3],
    representative: true,
    note: `Thermal overload relay; pick the band that brackets the motor FLC. ${VERIFY}`,
    orderCodeHint: 'LRD…',
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'Acti9 iID',
    kind: 'rccb',
    ratingsA: [25, 40, 63, 80, 100],
    poles: [2, 4],
    representative: true,
    note: `Residual-current circuit breaker (RCCB); choose the rated residual current (30/100/300 mA) separately. ${VERIFY}`,
    orderCodeHint: 'A9R…',
  },
  {
    manufacturer: 'Schneider Electric',
    series: 'Acti9 iPRD / iQuick PRD',
    kind: 'spd',
    ratingsA: [20, 40, 65],
    poles: [1, 2, 3, 4],
    breakingKa: 65,
    representative: true,
    note: `Type 2 surge protective device; ratings shown are representative Imax (kA, 8/20 µs). ${VERIFY}`,
  },
];
