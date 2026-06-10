/**
 * Point-level detail for final circuits: individual light fixtures grouped onto
 * wall/relay switches, and socket-outlet points. All optional on a circuit —
 * when present, the engine derives the circuit's connected load from the points
 * (instead of the flat `loadW`) and checks the switching arrangement.
 */

/** A row of identical light fittings on a lighting circuit. */
export interface LightFixture {
  id: string;
  /** Fitting description, e.g. "LED downlight 12 W", "TL LED 2×18 W". */
  name: string;
  /** Power per fitting (W), incl. driver/ballast losses. */
  wattsPerFitting: number;
  /** Number of identical fittings in this row. */
  qty: number;
  /** The switch group controlling this row; absent = permanently live (unswitched). */
  switchGroupId?: string;
}

/** How a switch group is actuated. */
export type SwitchKind = 'conventional' | 'smart';

/** Wireless/bus protocol of a smart switching module. */
export type SmartProtocol = 'wifi' | 'zigbee' | 'relay_bus' | 'knx';

/**
 * A switching point (wall switch gang or smart relay channel) controlling one or
 * more fixture rows on the circuit.
 */
export interface SwitchGroup {
  id: string;
  /** Label on the drawing/schedule, e.g. "SW1 — entrance". */
  label: string;
  kind: SwitchKind;
  /** Conventional only: gangs on the plate (1–4). */
  gang?: number;
  /** Conventional only: 1-way, or 2-way (two-location control, e.g. stairs). */
  ways?: 1 | 2;
  /** Smart only: control protocol of the relay module. */
  protocol?: SmartProtocol;
  /**
   * Smart only: whether a neutral conductor is available at the switch point.
   * Most retrofit smart relay modules require one; without it a no-neutral
   * (dimmer-style) module or a neutral pull is needed.
   */
  neutralAtSwitch?: boolean;
}

/** A row of identical socket-outlet points on a socket circuit. */
export interface SocketOutlet {
  id: string;
  /** Location/description, e.g. "Kitchen counter". */
  name: string;
  /** Number of identical outlet points in this row. */
  qty: number;
  /** General-purpose point, or a dedicated outlet for one appliance. */
  type?: 'general' | 'dedicated';
  /**
   * Planned load per point (VA). Absent → the standard planning value
   * (`VA_PER_SOCKET_POINT`, 200 VA). Set it on dedicated/heavy outlets so the
   * row carries the real appliance load.
   */
  vaPerPoint?: number;
}
