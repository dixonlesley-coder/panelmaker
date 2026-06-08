/**
 * Control / ladder schematic model. A schematic is a set of horizontal rungs
 * drawn between two vertical power rails; each rung is a left-to-right series of
 * symbols (contacts, coils, pilot devices). Symbols sharing a `col` on different
 * `branch` lines are wired in parallel (e.g. a start push-button paralleled by a
 * seal-in auxiliary contact).
 *
 * Symbols cross-reference power-side devices via `deviceRef.deviceId` (the same
 * id used by `AssemblyDevice`): the coil here and the contactor in the power SLD
 * are one device shown two ways.
 */

export type SchematicSymbolType =
  | 'no-contact'
  | 'nc-contact'
  | 'coil'
  | 'timer-coil-on'
  | 'timer-contact-on'
  | 'overload-contact'
  | 'pushbutton-no'
  | 'pushbutton-nc'
  | 'estop'
  | 'lamp'
  | 'level-contact'
  | 'pressure-contact';

export type DeviceElement = 'coil' | 'aux-no' | 'aux-nc' | 'main';

export interface SchematicSymbol {
  id: string;
  rungId: string;
  type: SchematicSymbolType;
  /** Series position along the rung, left (0) to right. */
  col: number;
  /** Parallel branch index; symbols sharing a col but differing branch are parallel. */
  branch: number;
  label?: string;
  /** Link to the power-side device this element belongs to. */
  deviceRef?: { deviceId: string; element: DeviceElement };
  generated: boolean;
}

export interface SchematicRung {
  id: string;
  order: number;
  label?: string;
  /** True if produced by template auto-generation (vs hand-authored). */
  generated: boolean;
  /** Generated rungs are locked (read-only) until explicitly detached. */
  locked: boolean;
}

export interface SchematicConnection {
  id: string;
  fromSymbolId: string;
  toSymbolId: string;
}

export interface ControlSchematic {
  circuitId: string;
  rungs: SchematicRung[];
  symbols: SchematicSymbol[];
  connections: SchematicConnection[];
}
