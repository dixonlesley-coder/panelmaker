/**
 * ABB — representative catalog families.
 *
 * Real, public product-line names (System pro M compact S200, Tmax XT, AF/A,
 * OVR) used nominatively with STANDARD IEC rating ladders. Breaking-capacity
 * tiers are the well-known standard values for each series; everything here is
 * REPRESENTATIVE and must be verified against the manufacturer datasheet.
 */

import type { CatalogFamily } from './types';

/** Shared verification reminder appended to every family note. */
const VERIFY =
  'Representative ratings — verify exact catalogue number, Icu and price against the manufacturer datasheet.';

/** Standard IEC 60898 MCB rated-current ladder (A). */
const MCB_LADDER = [6, 10, 16, 20, 25, 32, 40, 50, 63];

/** Standard AC-3 rated currents (A) for the AF / A contactor range. */
const AF_AC3 = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95, 115, 150];

/** ABB representative families. */
export const abb: CatalogFamily[] = [
  {
    manufacturer: 'ABB',
    series: 'System pro M compact S200',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 6,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Final-circuit MCB, ~6 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'S20…',
  },
  {
    manufacturer: 'ABB',
    series: 'System pro M compact S200M',
    kind: 'mcb',
    ratingsA: [...MCB_LADDER],
    poles: [1, 2, 3, 4],
    breakingKa: 10,
    curves: ['B', 'C', 'D'],
    representative: true,
    note: `Higher breaking-capacity MCB, ~10 kA (Icn) class. ${VERIFY}`,
    orderCodeHint: 'S20…M…',
  },
  {
    manufacturer: 'ABB',
    series: 'Tmax XT (XT1–XT5)',
    kind: 'mccb',
    // XT1 160, XT2 160, XT3 250, XT4 250, XT5 400/630 frames.
    ratingsA: [160, 250, 400, 630],
    poles: [3, 4],
    breakingKa: 36,
    representative: true,
    note: `MCCB frames XT1/XT2 160 A, XT3/XT4 250 A, XT5 400/630 A; breaking class depends on the N/S/H/L variant. ${VERIFY}`,
  },
  {
    manufacturer: 'ABB',
    series: 'AF / A contactors',
    kind: 'contactor',
    ratingsA: [...AF_AC3],
    poles: [3],
    representative: true,
    note: `Power contactor, AC-3 rated currents. ${VERIFY}`,
    orderCodeHint: 'AF…',
  },
  {
    manufacturer: 'ABB',
    series: 'TF / EF thermal overload',
    kind: 'overload_relay',
    ratingsA: [...AF_AC3],
    poles: [3],
    representative: true,
    note: `Thermal overload relay; pick the band that brackets the motor FLC. ${VERIFY}`,
  },
  {
    manufacturer: 'ABB',
    series: 'OVR',
    kind: 'spd',
    ratingsA: [20, 40, 70],
    poles: [1, 2, 3, 4],
    breakingKa: 70,
    representative: true,
    note: `Type 1/2 surge protective device; ratings shown are representative Imax (kA, 8/20 µs). ${VERIFY}`,
  },
];
