/**
 * Panel-assembly labor reference data.
 *
 * Typical shop assembly/wiring man-hours per device, keyed by the BOM line
 * category emitted by the bill-of-materials builder. These are defensible
 * order-of-magnitude figures for an Indonesian LV panel builder fabricating to
 * PUIL 2011 — mounting the device on DIN rail / back-plate, terminating its
 * power and control wiring, labelling and testing it. They are intended as a
 * quotation default the estimator overrides with a measured shop rate.
 *
 * Stamped with STANDARDS_VERSION so a quotation remains reproducible as the
 * figures are revised.
 */

/**
 * Assembly hours per unit (one device / one cable run) by BOM category. The
 * keys mirror the `category` field on a {@link import('../types/results').BomLine}
 * (which is the `PartCategory` for control gear, plus 'breaker'/'cable'/'busbar'
 * /'enclosure' for the power line items). Categories without an explicit entry
 * fall back to {@link DEFAULT_ASSEMBLY_HOURS}.
 */
export const ASSEMBLY_HOURS_PER_UNIT: Readonly<Record<string, number>> = {
  // Power gear ------------------------------------------------------------
  breaker: 0.3, // mount on rail + terminate line/load + label
  cable: 0.2, // per modelled run: cut, dress, gland, terminate, ferrule
  busbar: 1.0, // cut/drill/insulate a busbar set + torque the joints
  enclosure: 4.0, // prep, drill, mount gland plates, back-plate fit-out
  accessory: 0.1, // minor accessory (din-rail end, marker, etc.)
  // Final-circuit points — field/point installation, not shop panel build.
  // Counted per unit, so a fixture/socket row's qty drives the total install
  // labor: mount the point, run/terminate its drop, lamp/plate it and test.
  light_fixture: 0.4, // per fitting: mount, terminate, lamp, test
  switch: 0.3, // per conventional switch: back box, wire, fit plate, test
  smart_switch: 0.6, // per smart module: mount, wire (incl. neutral), pair/commission
  socket_outlet: 0.35, // per outlet: back box, wire, fit, test
  // Control gear ----------------------------------------------------------
  contactor: 0.6, // power + control wiring of a contactor
  overload_relay: 0.3, // clip to contactor, set, wire trip contacts
  control_relay: 0.25,
  timer_relay: 0.25,
  phase_protection_relay: 0.3,
  pilot_device: 0.2, // door-mounted push-button / selector
  indicator_lamp: 0.15,
  control_transformer: 0.5,
  control_protection: 0.2, // control fuse / mini-MCB
  vfd: 1.5, // mount, heat-management, power + control + comms wiring
  soft_starter: 1.2,
  vfd_accessory: 0.3, // line reactor / EMC filter / braking resistor
  aux_contact_block: 0.1,
  terminal_block: 0.05, // per terminal — many, but trivial each
  // Level / pump gear -----------------------------------------------------
  level_relay: 0.4,
  float_switch: 0.3,
  electrode_assembly: 0.5,
  pressure_switch: 0.3,
  pressure_transmitter: 0.4,
  level_sensor: 0.4,
  alternator_relay: 0.3,
  hoa_selector: 0.2,
  run_hour_meter: 0.2,
  alarm_device: 0.2,
};

/** Fallback assembly hours for a BOM category with no explicit entry. */
export const DEFAULT_ASSEMBLY_HOURS = 0.25;

/** Assembly hours for one unit of `category` (falls back to the default). */
export function assemblyHoursForCategory(category: string): number {
  return ASSEMBLY_HOURS_PER_UNIT[category] ?? DEFAULT_ASSEMBLY_HOURS;
}
