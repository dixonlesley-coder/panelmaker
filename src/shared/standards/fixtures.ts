/**
 * Final-circuit point and switching reference data — light fixtures, socket
 * outlets and their wall/relay switches, per PUIL 2011 final-circuit practice
 * and IEC 60669 (switches for household installations).
 *
 * The point limits are conventional Indonesian design practice for 10 A
 * (lighting) / 16 A (socket) final circuits rather than hard clause numbers —
 * they keep final circuits maintainable and the volt-drop predictable.
 */

import { STANDARDS_VERSION } from './version';
import type { SmartProtocol } from '../types/fixtures';

export const FIXTURES_STANDARD = STANDARDS_VERSION;

/**
 * Apparent power assumed per general-purpose socket-outlet point (VA). Common
 * Indonesian design practice (cf. NEC's 180 VA per strap); used to derive a
 * socket circuit's connected load from its point count. Dedicated outlets
 * should carry the real appliance load instead.
 */
export const VA_PER_SOCKET_POINT = 200;

/** Maximum recommended points on one lighting final circuit (10 A practice). */
export const MAX_POINTS_PER_LIGHTING_CIRCUIT = 12;

/** Maximum recommended outlet points on one socket final circuit (16 A practice). */
export const MAX_POINTS_PER_SOCKET_CIRCUIT = 8;

/**
 * Rated current of a conventional wall light switch (IEC 60669-1, typical 10 AX).
 * The "AX" rating covers fluorescent/LED inrush at the rated current.
 */
export const CONVENTIONAL_SWITCH_RATING_A = 10;

/**
 * Recommended maximum controlled load per conventional switch gang (W). Held
 * well below the 10 AX thermal rating because LED-driver inrush (tens of amps
 * for ms) erodes contact life on heavily-loaded gangs.
 */
export const MAX_W_PER_CONVENTIONAL_GANG = 800;

/**
 * Typical resistive rating of a smart relay module channel (A) — Wi-Fi/Zigbee
 * in-wall modules are commonly 10 A resistive, derated for LED loads.
 */
export const SMART_RELAY_RATING_A = 10;

/**
 * Recommended maximum controlled load per smart relay channel (W). Module
 * vendors commonly cap LED lighting at ~⅓–½ of the resistive rating; 600 W is
 * a safe planning figure for a 10 A channel driving LED fixtures.
 */
export const MAX_W_PER_SMART_CHANNEL = 600;

/** Display labels for the smart-module protocols. */
export const SMART_PROTOCOL_LABELS: Readonly<Record<SmartProtocol, string>> = {
  wifi: 'Wi-Fi',
  zigbee: 'Zigbee',
  relay_bus: 'Relay bus',
  knx: 'KNX',
};

/** Governing references for the point/switching checks. */
export const FIXTURES_CLAUSE =
  'PUIL 2011 final-circuit practice; IEC 60669-1 (switches); IEC 60364-5-52 (point loading)';

/**
 * Common LED luminaire types with typical wattages (incl. driver losses) for the
 * quick lighting-load calculator. These are planning defaults — editable per row
 * — covering the fittings used on Indonesian commercial/residential jobs.
 * LED strip is quoted per metre (enter the run length as the quantity).
 */
export interface FixturePreset {
  /** Stable key for the picker. */
  id: string;
  /** Human label shown in the calculator. */
  label: string;
  /** Typical power per fitting (W) — or per metre for strip. */
  watts: number;
}

export const LIGHTING_FIXTURE_PRESETS: readonly FixturePreset[] = [
  { id: 'downlight9', label: 'LED downlight 9 W', watts: 9 },
  { id: 'downlight12', label: 'LED downlight 12 W', watts: 12 },
  { id: 'downlight18', label: 'LED downlight 18 W', watts: 18 },
  { id: 'panel18', label: 'LED panel 30×30 / 40×40', watts: 18 },
  { id: 'panel40', label: 'LED panel 60×60', watts: 40 },
  { id: 'batten18', label: 'LED batten / TL 0.6 m', watts: 18 },
  { id: 'batten36', label: 'LED batten / TL 1.2 m', watts: 36 },
  { id: 'strip10', label: 'LED strip (per metre)', watts: 10 },
  { id: 'spot15', label: 'LED spotlight / track', watts: 15 },
  { id: 'flood50', label: 'LED floodlight 50 W', watts: 50 },
  { id: 'flood100', label: 'LED floodlight 100 W', watts: 100 },
  { id: 'highbay150', label: 'LED highbay 150 W', watts: 150 },
  { id: 'bulkhead12', label: 'Bulkhead / emergency', watts: 12 },
  { id: 'pendant25', label: 'Pendant / decorative', watts: 25 },
  { id: 'custom', label: 'Custom fitting…', watts: 12 },
];
