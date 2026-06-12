import {
  LV_SUPPLY_LIMIT_KVA,
  MV_VOLTAGE_V,
  TRANSFORMER_IMPEDANCE_PCT,
  TRANSFORMER_LOADING_FACTOR,
  selectTransformerKva,
  transformerFlc,
} from '../standards/transformer';
import type { SupplyResult } from '../types/results';
import { round } from './util';

/**
 * Decide the project supply arrangement from the total diversified demand.
 * Within the Indonesian 200 kVA LV ceiling -> direct PLN low-voltage connection.
 * Above it -> medium-voltage (20 kV) supply through a step-down transformer and
 * an MV panel, with the transformer sized to ~80% loading. `dual` forces an MV
 * service with TWO transformers on split bus sections (hotels / data centers).
 */
export function determineSupply(
  totalDemandKva: number,
  lvVoltageV = 400,
  opts: { dual?: boolean } = {},
): SupplyResult {
  if (!opts.dual && totalDemandKva <= LV_SUPPLY_LIMIT_KVA) {
    return {
      type: 'LV',
      voltageV: lvVoltageV,
      demandKva: round(totalDemandKva, 1),
      note: `Within the ${LV_SUPPLY_LIMIT_KVA} kVA low-voltage limit — direct PLN LV connection (no transformer needed).`,
    };
  }

  // Dual supply (hotels / data centers): two transformers, each sized for half
  // the demand, on split bus sections behind a normally-open coupler. The fault
  // level the boards see is ONE unit's (the coupler never parallels them).
  if (opts.dual) {
    const perUnitRequired = totalDemandKva / 2 / TRANSFORMER_LOADING_FACTOR;
    const transformerKva = selectTransformerKva(perUnitRequired);
    return {
      type: 'MV',
      voltageV: lvVoltageV,
      mvVoltageV: MV_VOLTAGE_V,
      demandKva: round(totalDemandKva, 1),
      transformerKva,
      transformerCount: 2,
      transformerImpedancePct: TRANSFORMER_IMPEDANCE_PCT,
      transformerPrimaryA: round(transformerFlc(transformerKva, MV_VOLTAGE_V), 1),
      transformerSecondaryA: round(transformerFlc(transformerKva, lvVoltageV), 0),
      note: `Dual-transformer MV supply: 2 × ${transformerKva} kVA on split bus sections with a normally-open bus coupler. Each unit carries its section (≈ half the ${round(totalDemandKva, 1)} kVA demand); with one unit out, close the coupler and shed non-essential load onto the survivor — full 2N redundancy needs each unit rated for the whole demand. Fault level is one unit's (coupler N.O.).`,
    };
  }

  const requiredKva = totalDemandKva / TRANSFORMER_LOADING_FACTOR;
  const transformerKva = selectTransformerKva(requiredKva);

  return {
    type: 'MV',
    voltageV: lvVoltageV,
    mvVoltageV: MV_VOLTAGE_V,
    demandKva: round(totalDemandKva, 1),
    transformerKva,
    transformerImpedancePct: TRANSFORMER_IMPEDANCE_PCT,
    transformerPrimaryA: round(transformerFlc(transformerKva, MV_VOLTAGE_V), 1),
    transformerSecondaryA: round(transformerFlc(transformerKva, lvVoltageV), 0),
    note: `Demand exceeds ${LV_SUPPLY_LIMIT_KVA} kVA — medium-voltage (20 kV) supply via a ${transformerKva} kVA transformer and MV panel (incomer + metering + transformer feeder) is required.`,
  };
}
