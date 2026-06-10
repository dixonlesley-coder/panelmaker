/**
 * Chint — representative catalog families.
 *
 * Real, public product-line names (NB1-63, NXM, NXC, NU6) used nominatively with
 * STANDARD IEC rating ladders. Breaking-capacity tiers are the well-known
 * standard values for each series; everything here is REPRESENTATIVE and must be
 * verified against the manufacturer datasheet.
 */

import type { CatalogFamily } from './types';

/** Shared verification reminder appended to every family note. */
const VERIFY =
  'Representative ratings — verify exact catalogue number, Icu and price against the manufacturer datasheet.';

/** Standard IEC 60898 MCB rated-current ladder (A). */
const MCB_LADDER = [6, 10, 16, 20, 25, 32, 40, 50, 63];

/** Standard NXM MCCB frame ratings (A). */
const NXM_FRAMES = [125, 160, 250, 400, 630, 800];

/** Standard AC-3 rated currents (A) for the NXC contactor range. */
const NXC_AC3 = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95, 115, 150, 185, 225, 265, 300, 400, 500, 630];

/** Chint representative families. */
export const chint: CatalogFamily[] = [
  {
    manufacturer: 'Chint',
    series: 'NB1-63',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 6,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Final-circuit MCB, ~6 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'NB1-63…',
  },
  {
    manufacturer: 'Chint',
    series: 'NXM',
    kind: 'mccb',
    ratingsA: [...NXM_FRAMES],
    poles: [3, 4],
    breakingKa: 36,
    representative: true,
    note: `MCCB frames 125–800 A; breaking class depends on the variant. ${VERIFY}`,
    orderCodeHint: 'NXM-…',
  },
  {
    manufacturer: 'Chint',
    series: 'NXC',
    kind: 'contactor',
    ratingsA: [...NXC_AC3],
    poles: [3],
    representative: true,
    note: `Power contactor, AC-3 rated currents. ${VERIFY}`,
    orderCodeHint: 'NXC-…',
  },
  {
    manufacturer: 'Chint',
    series: 'NR2 thermal overload',
    kind: 'overload_relay',
    ratingsA: [...NXC_AC3],
    poles: [3],
    representative: true,
    note: `Thermal overload relay; pick the band that brackets the motor FLC. ${VERIFY}`,
    orderCodeHint: 'NR2-…',
  },
  {
    manufacturer: 'Chint',
    series: 'NU6',
    kind: 'spd',
    ratingsA: [20, 40, 60],
    poles: [1, 2, 3, 4],
    breakingKa: 60,
    representative: true,
    note: `Type 2 surge protective device; ratings shown are representative Imax (kA, 8/20 µs). ${VERIFY}`,
  },
];
