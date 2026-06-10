/**
 * LS Electric — representative catalog families.
 *
 * Real, public product-line names (BKN, Metasol, Susol, Metasol MC) used
 * nominatively with STANDARD IEC rating ladders. Breaking-capacity tiers are the
 * well-known standard values for each series; everything here is REPRESENTATIVE
 * and must be verified against the manufacturer datasheet.
 */

import type { CatalogFamily } from './types';

/** Shared verification reminder appended to every family note. */
const VERIFY =
  'Representative ratings — verify exact catalogue number, Icu and price against the manufacturer datasheet.';

/** Standard IEC 60898 MCB rated-current ladder (A). */
const MCB_LADDER = [6, 10, 16, 20, 25, 32, 40, 50, 63];

/** Standard Metasol / Susol MCCB frame ratings (A). */
const TS_FRAMES = [100, 160, 250, 400, 630, 800];

/** Standard AC-3 rated currents (A) for the Metasol MC contactor range. */
const MC_AC3 = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95, 115, 150, 185, 225, 265, 300, 400, 500, 630];

/** LS Electric representative families. */
export const ls: CatalogFamily[] = [
  {
    manufacturer: 'LS Electric',
    series: 'BKN',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 6,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Final-circuit MCB, ~6 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'BKN…',
  },
  {
    manufacturer: 'LS Electric',
    series: 'Metasol / Susol TS / TD',
    kind: 'mccb',
    ratingsA: [...TS_FRAMES],
    poles: [3, 4],
    breakingKa: 36,
    representative: true,
    note: `MCCB frames 100–800 A; breaking class depends on the Metasol/Susol variant. ${VERIFY}`,
    orderCodeHint: 'TS…N / TD…',
  },
  {
    manufacturer: 'LS Electric',
    series: 'Metasol MC',
    kind: 'contactor',
    ratingsA: [...MC_AC3],
    poles: [3],
    representative: true,
    note: `Power contactor, AC-3 rated currents. ${VERIFY}`,
    orderCodeHint: 'MC-…',
  },
  {
    manufacturer: 'LS Electric',
    series: 'Metasol MT thermal overload',
    kind: 'overload_relay',
    ratingsA: [...MC_AC3],
    poles: [3],
    representative: true,
    note: `Thermal overload relay; pick the band that brackets the motor FLC. ${VERIFY}`,
    orderCodeHint: 'MT-…',
  },
  {
    manufacturer: 'LS Electric',
    series: 'LS SPD',
    kind: 'spd',
    ratingsA: [20, 40, 60],
    poles: [1, 2, 3, 4],
    breakingKa: 60,
    representative: true,
    note: `Type 2 surge protective device; ratings shown are representative Imax (kA, 8/20 µs). ${VERIFY}`,
  },
];
