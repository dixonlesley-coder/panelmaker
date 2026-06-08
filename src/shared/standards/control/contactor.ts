/**
 * Contactor and overload-relay reference data, IEC 60947-4-1.
 *   - AC-3 frame ratings mapped to switchable motor power at 400 V.
 *   - AC-4 (inching/plugging) derating.
 *   - Star-delta winding current factor.
 *   - Per-frame heat dissipation for enclosure thermal sizing.
 */

export interface ContactorFrame {
  /** Rated operational current Ie under AC-3 (A). */
  ac3A: number;
  /** Max motor power switched at 400 V under AC-3 (kW). */
  kw400: number;
  /** Approximate steady-state heat dissipation at rated current (W). */
  heatLossW: number;
}

/** Standard contactor frames, ascending by AC-3 current. */
export const CONTACTOR_AC3_FRAMES: readonly ContactorFrame[] = [
  { ac3A: 9, kw400: 4, heatLossW: 2.2 },
  { ac3A: 12, kw400: 5.5, heatLossW: 2.5 },
  { ac3A: 18, kw400: 7.5, heatLossW: 3.0 },
  { ac3A: 25, kw400: 11, heatLossW: 3.5 },
  { ac3A: 32, kw400: 15, heatLossW: 4.0 },
  { ac3A: 40, kw400: 18.5, heatLossW: 4.5 },
  { ac3A: 50, kw400: 22, heatLossW: 6.0 },
  { ac3A: 65, kw400: 30, heatLossW: 7.5 },
  { ac3A: 80, kw400: 37, heatLossW: 8.5 },
  { ac3A: 95, kw400: 45, heatLossW: 9.5 },
  { ac3A: 115, kw400: 55, heatLossW: 11 },
  { ac3A: 150, kw400: 75, heatLossW: 14 },
  { ac3A: 185, kw400: 90, heatLossW: 16 },
  { ac3A: 225, kw400: 110, heatLossW: 18 },
  { ac3A: 265, kw400: 132, heatLossW: 22 },
  { ac3A: 300, kw400: 160, heatLossW: 26 },
  { ac3A: 400, kw400: 200, heatLossW: 32 },
  { ac3A: 500, kw400: 250, heatLossW: 40 },
  { ac3A: 630, kw400: 300, heatLossW: 48 },
];

/**
 * When an AC-3 frame is used for AC-4 duty (inching/plugging — breaking locked
 * rotor current every cycle), usable current is ~0.2-0.3x. Use 0.25 as default.
 */
export const AC4_DERATE_FACTOR = 0.25;

/**
 * In a star-delta starter each phase winding carries line current / sqrt(3).
 * The star contactor therefore only needs ~58% of the motor FLC; the main and
 * delta contactors carry the full (delta) running current.
 */
export const STAR_DELTA_WINDING_FACTOR = 0.58;

export type OverloadTripClass = '10A' | '10' | '20' | '30';

/** Overload relay set-point factor on motor FLC (IEC allows 1.05-1.15). */
export const OVERLOAD_SETTING_FACTOR = 1.15;

/** Trip class recommended for a given starting duty. */
export function overloadTripClassFor(duty: 'normal' | 'heavy' | 'jogging'): OverloadTripClass {
  switch (duty) {
    case 'heavy':
      return '20';
    case 'jogging':
      return '30';
    default:
      return '10';
  }
}
