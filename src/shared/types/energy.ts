/** Energy-loss and distributed-energy economics (ROI) result types. */

/** A breakdown of system energy losses (power and as a fraction of demand). */
export interface LossResult {
  /** Conductor I²R (copper) loss across all leaf circuits (W). */
  copperLossW: number;
  /** Transformer no-load (iron) + load (copper) loss; 0 for LV supplies (W). */
  transformerLossW: number;
  /** Total loss = copper + transformer (W). */
  totalLossW: number;
  /** Total loss as a percentage of the building demand power. */
  lossPercent: number;
}

/** Grid-tied solar return-on-investment summary (IDR). */
export interface SolarRoiResult {
  /** Energy bill avoided per year from PV self-consumption (IDR). */
  annualSavings: number;
  /** Turn-key installed capital cost (IDR). */
  capex: number;
  /** Simple payback period (years); undefined when no PV is configured. */
  paybackYears?: number;
  /** Net value over the system lifetime = lifetime savings − capex (IDR). */
  lifetimeNet: number;
}

/** Battery storage economics. Backup is a resilience investment, not pure ROI. */
export interface BatteryRoiResult {
  /** Installed capital cost (IDR). */
  capex: number;
}

/** Energy-loss accounting and PV/battery economics for a computed system. */
export interface EnergyResult {
  losses: LossResult;
  /** Building daily energy consumption from the load profile (kWh). */
  dailyKwh: number;
  /** Daily energy lost to copper + transformer losses (kWh). */
  dailyLossKwh: number;
  /** Billed energy (consumption + losses) over a 30-day month (kWh). */
  monthlyKwh: number;
  /** Energy charge for a 30-day month (consumption + losses) (IDR). */
  monthlyEnergyCost: number;
  /** Annual cost of energy losses alone (IDR). */
  annualLossCost: number;
  /** Energy charge applied (IDR/kWh). */
  tariffIdrPerKwh: number;
  solar: SolarRoiResult;
  battery: BatteryRoiResult;
  /** Human-readable assumptions and caveats. */
  notes: string[];
}

/** Optional overrides for {@link computeEnergyEconomics}. */
export interface EnergyOptions {
  /** Override the energy charge (IDR/kWh); defaults to the supply-class tariff. */
  tariffIdrPerKwh?: number;
  /**
   * Scale loss energy by the load factor (losses follow the duty cycle) instead
   * of treating peak loss as continuous over 24 h. Default false (conservative).
   */
  scaleLossesByLoadFactor?: boolean;
}
