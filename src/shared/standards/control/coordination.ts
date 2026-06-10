/**
 * Type-2 coordinated DOL starter sets (IEC 60947-4-1), 400 V — manufacturer-
 * style verified combinations of motor breaker + contactor + overload range.
 * After a short-circuit a type-2 combination must remain serviceable (no
 * welding / recalibration), which can only be guaranteed by a TESTED set —
 * independently sized devices are merely a starting point.
 *
 * Composite of typical published tables (Schneider TeSys/GV-NSX, ABB MS/AF,
 * Siemens 3RV/3RT). Always confirm against the chosen manufacturer's table.
 */

export interface Type2Set {
  /** Rated motor power (kW, 400 V). */
  kw: number;
  /** Motor circuit-breaker / MCCB rating of the verified set (A). */
  breakerA: number;
  /** Contactor AC-3 rating of the verified set (A). */
  contactorAc3A: number;
  /** Overload adjustment range of the verified set (A). */
  olRangeA: readonly [number, number];
}

export const TYPE2_DOL_SETS_400V: readonly Type2Set[] = [
  { kw: 0.37, breakerA: 1.6, contactorAc3A: 9, olRangeA: [0.63, 1] },
  { kw: 0.55, breakerA: 2.5, contactorAc3A: 9, olRangeA: [1, 1.6] },
  { kw: 0.75, breakerA: 2.5, contactorAc3A: 9, olRangeA: [1.6, 2.5] },
  { kw: 1.1, breakerA: 4, contactorAc3A: 9, olRangeA: [2.5, 4] },
  { kw: 1.5, breakerA: 4, contactorAc3A: 9, olRangeA: [2.5, 4] },
  { kw: 2.2, breakerA: 6.3, contactorAc3A: 9, olRangeA: [4, 6.3] },
  { kw: 3, breakerA: 10, contactorAc3A: 9, olRangeA: [6, 10] },
  { kw: 4, breakerA: 10, contactorAc3A: 9, olRangeA: [6, 10] },
  { kw: 5.5, breakerA: 14, contactorAc3A: 12, olRangeA: [9, 14] },
  { kw: 7.5, breakerA: 18, contactorAc3A: 18, olRangeA: [13, 18] },
  { kw: 11, breakerA: 25, contactorAc3A: 25, olRangeA: [17, 25] },
  { kw: 15, breakerA: 32, contactorAc3A: 32, olRangeA: [23, 32] },
  { kw: 18.5, breakerA: 40, contactorAc3A: 40, olRangeA: [30, 40] },
  { kw: 22, breakerA: 50, contactorAc3A: 50, olRangeA: [37, 50] },
  { kw: 30, breakerA: 63, contactorAc3A: 65, olRangeA: [48, 65] },
  { kw: 37, breakerA: 80, contactorAc3A: 80, olRangeA: [60, 80] },
  { kw: 45, breakerA: 100, contactorAc3A: 95, olRangeA: [70, 95] },
  { kw: 55, breakerA: 125, contactorAc3A: 115, olRangeA: [90, 120] },
  { kw: 75, breakerA: 160, contactorAc3A: 150, olRangeA: [110, 160] },
  { kw: 90, breakerA: 200, contactorAc3A: 185, olRangeA: [140, 200] },
];

/** The verified type-2 DOL set covering a motor rating, or undefined beyond table. */
export function type2SetFor(motorKw: number): Type2Set | undefined {
  return TYPE2_DOL_SETS_400V.find((s) => s.kw >= motorKw);
}
