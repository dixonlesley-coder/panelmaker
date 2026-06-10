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
