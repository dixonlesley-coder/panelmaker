/**
 * Surge Protective Device (SPD) selection engine, per IEC 61643-11,
 * IEC 60364-5-534 / -4-44 §443 and PUIL 2011 (SNI 0225:2011) §3.20.
 *
 * `recommendSpd` is a pure, deterministic function (no Node/DOM/side effects):
 * given the earthing system, lightning / overhead-line exposure and whether the
 * device sits at the service origin, it returns the recommended SPD class,
 * ratings (Iimp / In / Imax), the L-N continuous operating voltage `Uc`, the
 * connection arrangement and the coordinated protection-level ceiling `Up`.
 *
 * Decision summary:
 * - **At the origin** (main board / service entrance):
 *   - external LPS *or* overhead-line / direct-strike exposure → **Type 1**
 *     (encoded as a combined **Type 1+2** so a single unit also gives the
 *     Type 2 protection the board needs);
 *   - otherwise → **Type 2** (standard main-board protection).
 * - **Sub-distribution** (`atOrigin = false`): **Type 2** (or a Type 2/3
 *   stage near sensitive equipment), coordinated downstream of the origin SPD.
 * - **`Uc` / connection** is chosen by earthing system: TT (and TN where the
 *   N-PE path may see √3·U0 under fault) → "3+1" with a higher N-PE Uc; plain
 *   TN-S → common-mode 275 V modules.
 */

import {
  SPD_CLAUSE,
  SPD_CONNECTION_NOTE,
  SPD_RATINGS,
  UP_TARGET_V,
  ratePup,
  ucForEarthing,
  type SpdConnection,
  type SpdType,
} from '../standards/spd';
import type { EarthingSystem } from '../types/electrical';

/**
 * Beyond this feeder distance from the origin SPD, protection no longer covers
 * the sub-board (oscillation doubling, IEC 61643-12) — a secondary Type 2 SPD
 * is recommended there.
 */
export const SECONDARY_SPD_DISTANCE_M = 10;

/** Inputs to {@link recommendSpd}. */
export interface SpdSelectionInput {
  /** Installation earthing arrangement — drives Uc and the connection mode. */
  earthingSystem: EarthingSystem;
  /**
   * The building has an external Lightning Protection System (air terminals /
   * down conductors). Forces a Type 1 device at the origin (partial-lightning
   * 10/350 µs current can be conducted into the installation).
   */
  hasExternalLps: boolean;
  /**
   * Supply arrives via an overhead line / the site has direct-strike exposure.
   * Also forces a Type 1 device at the origin.
   */
  overheadSupply: boolean;
  /**
   * This SPD is at the origin of the installation (main distribution board /
   * service entrance). When false, a coordinated sub-distribution stage is
   * recommended instead.
   */
  atOrigin: boolean;
}

/**
 * Recommendation produced by {@link recommendSpd}. The parent project wires this
 * into the shared result types; it is defined locally here so this module stays
 * self-contained.
 */
export interface SpdResult {
  /** Whether an SPD is recommended for this location. */
  recommended: boolean;
  /** Selected SPD class. */
  type: SpdType;
  /** Where the SPD is installed (origin / sub-distribution). */
  location: string;
  /** Maximum continuous operating voltage `Uc`, L-N (V). */
  ucV: number;
  /** N-PE `Uc` for a "3+1" arrangement (V), when applicable. */
  npeUcV?: number;
  /** Class I impulse current `Iimp` (10/350 µs), kA/pole — Type 1 only. */
  iimpKa?: number;
  /** Class II nominal discharge current `In` (8/20 µs), kA. */
  inKa?: number;
  /** Class II maximum discharge current `Imax` (8/20 µs), kA. */
  imaxKa?: number;
  /** Class III open-circuit voltage `Uoc` (combination wave), kV — Type 3. */
  uocKv?: number;
  /** Voltage protection level `Up` of the device (kV). */
  upKv: number;
  /**
   * The coordinated protection-level ceiling at the equipment terminals (kV).
   * Always ≤ the cat II withstand (2.5 kV); ≤ 1.5 kV where the device's own Up
   * already meets the comfortable target.
   */
  upKvMax: number;
  /** Connection arrangement (common-mode / "3+1"). */
  connection: string;
  /** How the device's Up rates against the cat II coordination target. */
  protectionRating: 'good' | 'acceptable' | 'inadequate';
  /** Human-readable rationale for the recommendation. */
  note: string;
  /** Governing standard clause references. */
  clause: string;
}

/** Build the connection text, appending the N-PE Uc for a "3+1" device. */
function connectionText(connection: SpdConnection, npeUcV?: number): string {
  const base = SPD_CONNECTION_NOTE[connection];
  if (connection === '3+1' && npeUcV != null) {
    return `${base} N-PE module Uc ≥ ${npeUcV} V.`;
  }
  return base;
}

/**
 * Recommend an SPD class, rating and connection for the given supply context.
 *
 * Deterministic and pure — same input always yields the same result.
 */
export function recommendSpd(input: SpdSelectionInput): SpdResult {
  const { earthingSystem, hasExternalLps, overheadSupply, atOrigin } = input;

  const directStrikeRisk = hasExternalLps || overheadSupply;
  const { ucV, npeUcV, connection } = ucForEarthing(earthingSystem);

  // Choose the SPD type for the location.
  let type: SpdType;
  let location: string;
  if (atOrigin) {
    // At the origin: Type 1 (combined 1+2) when there is a lightning/overhead
    // exposure, else a standard Type 2 main-board device.
    type = directStrikeRisk ? 'Type 1+2' : 'Type 2';
    location = 'Origin (main distribution board / service entrance)';
  } else {
    // Sub-distribution: a coordinated Type 2 stage (escalating toward Type 3
    // near sensitive equipment on long final circuits) downstream of the
    // origin SPD.
    type = 'Type 2';
    location = 'Sub-distribution board (coordinated downstream of the origin SPD)';
  }

  const rating = SPD_RATINGS[type];

  // The device's own Up, and the coordinated ceiling at the equipment. We never
  // let the reported ceiling exceed the cat II acceptable bound (2.5 kV); where
  // the device meets the comfortable target we report the 1.5 kV good ceiling.
  const protectionRating = ratePup(rating.upKv);
  const upKvMax =
    (protectionRating === 'good' ? UP_TARGET_V.good : UP_TARGET_V.acceptable) / 1000;

  // Compose the rationale.
  let note: string;
  if (atOrigin) {
    if (directStrikeRisk) {
      const cause = hasExternalLps
        ? 'the building has an external Lightning Protection System'
        : 'the supply is via an overhead line (direct-strike exposure)';
      note =
        `Type 1 (combined Type 1+2) at the origin because ${cause}; it conducts the ` +
        `partial-lightning impulse current (Iimp, 10/350 µs) and also provides the main-board ` +
        `Type 2 protection. ${connectionText(connection, npeUcV)}`;
    } else {
      note =
        `Type 2 at the main distribution board (no external LPS or overhead-line exposure). ` +
        `Standard origin overvoltage protection against switching and indirect lightning surges. ` +
        `${connectionText(connection, npeUcV)}`;
    }
  } else {
    note =
      `Type 2 SPD at the sub-distribution board, coordinated downstream of the origin device; ` +
      `add a Type 3 stage immediately before sensitive equipment on long final circuits. ` +
      `${connectionText(connection, npeUcV)}`;
  }

  return {
    recommended: true,
    type,
    location,
    ucV,
    npeUcV,
    iimpKa: rating.iimpKa,
    inKa: rating.inKa,
    imaxKa: rating.imaxKa,
    uocKv: rating.uocKv,
    upKv: rating.upKv,
    upKvMax,
    connection: connectionText(connection, npeUcV),
    protectionRating,
    note,
    clause: SPD_CLAUSE,
  };
}
