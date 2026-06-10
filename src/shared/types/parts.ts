/** Parts catalog domain types. */

/**
 * Every part category, as a runtime array so loaders/importers can validate a
 * category string against the union (the {@link PartCategory} type is derived
 * from it, keeping the two in lockstep).
 */
export const PART_CATEGORIES = [
  // power
  'breaker',
  'cable',
  'busbar',
  'enclosure',
  'accessory',
  // final-circuit points & switching
  'light_fixture',
  'switch',
  'smart_switch',
  'socket_outlet',
  // control
  'contactor',
  'overload_relay',
  'control_relay',
  'timer_relay',
  'phase_protection_relay',
  'pilot_device',
  'indicator_lamp',
  'control_transformer',
  'control_protection',
  'vfd',
  'soft_starter',
  'vfd_accessory',
  'aux_contact_block',
  'terminal_block',
  // metering
  'panel_meter',
  'current_transformer',
  // level / pump
  'level_relay',
  'float_switch',
  'electrode_assembly',
  'pressure_switch',
  'pressure_transmitter',
  'level_sensor',
  'alternator_relay',
  'hoa_selector',
  'run_hour_meter',
  'alarm_device',
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

/** A catalog part. `attributes` is a category-specific record validated by Zod. */
export interface Part {
  id: string;
  category: PartCategory;
  manufacturer: string;
  model: string;
  /** Category-specific electrical attributes (see partAttributes schemas). */
  attributes: Record<string, unknown>;
  defaultUnit: string;
  standardsVersion?: string;
}

/** Common attribute fields most gear parts carry (for enclosure/heat sizing). */
export interface GearAttributesCommon {
  heatLossW?: number;
  widthMm?: number;
}

/** A priced reference to a part within a pricelist. */
export interface PricelistItem {
  id: string;
  pricelistId: string;
  partId?: string;
  matchKey: string;
  unitPrice: number;
  currency: string;
}
