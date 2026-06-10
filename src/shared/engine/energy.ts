/**
 * Energy-loss accounting and distributed-energy economics (ROI).
 *
 * A standalone pass over an already-computed {@link SystemResult}: it sums the
 * conductor I²R losses of every leaf circuit, adds transformer losses for MV
 * supplies, converts power losses into billed energy at a PLN-style tariff, and
 * evaluates simple payback for any configured solar PV and battery storage.
 *
 * Pure and side-effect free — the engine never imports DB or DOM code.
 */

import { conductorResistanceOhmPerKm } from '../standards/conductors';
import {
  BATTERY_CAPEX_IDR_PER_KWH,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  SOLAR_CAPEX_IDR_PER_KWP,
  SOLAR_LIFETIME_YEARS,
  TRANSFORMER_LOAD_LOSS_PCT,
  TRANSFORMER_NO_LOAD_LOSS_PCT,
  tariffForClass,
} from '../standards/tariff';
import { ASSUMED_BUILDING_PF } from '../standards/transformer';
import type { ProjectInput } from '../types/project';
import type { SystemResult } from '../types/results';
import type { EnergyOptions, EnergyResult, LossResult } from '../types/energy';
import { computeLoadProfile } from './loadProfile';
import { round } from './util';

/** Number of current-carrying conductors that dissipate I²R per circuit. */
function lossPhases(phase: string): number {
  // 3-phase: I²R in each of the three lines. Single-phase: line + return.
  return phase === '3ph' ? 3 : 2;
}

/** Conductor I²R loss summed across every leaf circuit (W), material-aware. */
function copperLossW(project: ProjectInput, system: SystemResult): number {
  // Circuit length + the panel's conductor material live on the engine input.
  const lengthById = new Map<string, number>();
  const materialByPanel = new Map<string, 'Cu' | 'Al'>();
  for (const p of project.panels) {
    materialByPanel.set(p.id, p.material ?? 'Cu');
    for (const c of p.circuits) lengthById.set(c.id, c.lengthM);
  }

  let total = 0;
  for (const panel of Object.values(system.panels)) {
    const material = materialByPanel.get(panel.panelId) ?? 'Cu';
    for (const c of panel.circuits) {
      const lengthM = lengthById.get(c.circuitId) ?? 0;
      if (lengthM <= 0 || c.designCurrentA <= 0) continue;
      // Parallel runs split the current; per-run I²R summed over runs = I²R/runs.
      const runs = c.cable.runsPerPhase ?? 1;
      const rOhm = conductorResistanceOhmPerKm(c.cable.csaMm2, material) * (lengthM / 1000);
      total += (lossPhases(c.phase) * c.designCurrentA ** 2 * rOhm) / runs;
    }
  }
  return total;
}

/**
 * Transformer no-load (iron) + load (copper) loss for an MV supply (W).
 * No-load is fixed (~0.2% of kVA); load loss (~1% of kVA) scales with loading².
 * Returns 0 for a direct LV connection (no transformer).
 */
function transformerLossW(system: SystemResult): number {
  const { supply } = system;
  if (supply.type !== 'MV' || !supply.transformerKva || supply.transformerKva <= 0) return 0;
  const kva = supply.transformerKva;
  const loading = supply.demandKva / kva; // 0-1
  const noLoadKw = kva * TRANSFORMER_NO_LOAD_LOSS_PCT;
  const loadKw = kva * TRANSFORMER_LOAD_LOSS_PCT * loading ** 2;
  return (noLoadKw + loadKw) * 1000;
}

/**
 * Compute energy losses and solar/battery ROI for a project + computed system.
 * Does not modify the system; the caller passes the result of `computeSystem`.
 */
export function computeEnergyEconomics(
  project: ProjectInput,
  system: SystemResult,
  opts: EnergyOptions = {},
): EnergyResult {
  const notes: string[] = [];

  const copper = copperLossW(project, system);
  const transformer = transformerLossW(system);
  const totalLossW = copper + transformer;

  // Loss % is referenced to the delivered real power (kW). demand kVA was derived
  // as kW / ASSUMED_BUILDING_PF, so multiplying back by the *same* factor recovers
  // the diversified demand kW exactly (using the live `existingPf` here instead
  // would double-count power factor and skew the base).
  const demandKw = system.supply.demandKva * ASSUMED_BUILDING_PF;
  const lossPercent = demandKw > 0 ? (totalLossW / 1000 / demandKw) * 100 : 0;

  const losses: LossResult = {
    copperLossW: round(copper, 1),
    transformerLossW: round(transformer, 1),
    totalLossW: round(totalLossW, 1),
    lossPercent: round(lossPercent, 2),
  };

  // --- Energy + cost -------------------------------------------------------
  const profile = computeLoadProfile(project);
  const dailyKwh = profile.dailyKwh;

  // Loss energy: peak loss is computed at design (peak) current. Treating it as
  // continuous over 24 h is conservative; optionally scale by the load factor so
  // loss energy tracks the building's actual duty cycle.
  const lossDutyHours = opts.scaleLossesByLoadFactor ? 24 * profile.loadFactor : 24;
  const dailyLossKwh = (totalLossW / 1000) * lossDutyHours;
  notes.push(
    opts.scaleLossesByLoadFactor
      ? `Loss energy scaled by load factor ${profile.loadFactor} (${round(lossDutyHours, 1)} equivalent full-loss hours/day).`
      : 'Loss energy assumes peak losses run continuously (24 h/day) — a conservative upper bound.',
  );

  const tariff = opts.tariffIdrPerKwh ?? tariffForClass(system.supply.type);
  notes.push(
    opts.tariffIdrPerKwh !== undefined
      ? `Tariff overridden to ${tariff} IDR/kWh.`
      : `PLN ${system.supply.type} tariff ${tariff} IDR/kWh (non-subsidised business default).`,
  );

  const monthlyKwh = (dailyKwh + dailyLossKwh) * DAYS_PER_MONTH;
  const monthlyEnergyCost = monthlyKwh * tariff;
  const annualLossCost = dailyLossKwh * DAYS_PER_YEAR * tariff;

  // --- Solar ROI -----------------------------------------------------------
  const solarSized = system.sources?.solar;
  const solarDailyKwh = solarSized?.dailyKwh ?? 0;
  const solarAnnualSavings = solarDailyKwh * DAYS_PER_YEAR * tariff;
  const solarCapex = solarSized ? solarSized.arrayKwp * SOLAR_CAPEX_IDR_PER_KWP : 0;
  // Payback only defined when there is an array generating real savings.
  const paybackYears =
    solarSized && solarAnnualSavings > 0 ? solarCapex / solarAnnualSavings : undefined;
  const solarLifetimeNet = solarAnnualSavings * SOLAR_LIFETIME_YEARS - solarCapex;
  if (solarSized) {
    notes.push(
      `Solar: ${solarSized.arrayKwp} kWp at ${SOLAR_CAPEX_IDR_PER_KWP.toLocaleString('id-ID')} IDR/kWp ⇒ ${Math.round(
        solarCapex,
      ).toLocaleString('id-ID')} IDR; ~${solarDailyKwh} kWh/day offsets ${Math.round(
        solarAnnualSavings,
      ).toLocaleString('id-ID')} IDR/yr (simple, before degradation/escalation).`,
    );
  }

  // --- Battery economics ---------------------------------------------------
  const batterySized = system.sources?.battery;
  const batteryCapex = batterySized ? batterySized.installedKwh * BATTERY_CAPEX_IDR_PER_KWH : 0;
  if (batterySized) {
    notes.push(
      `Battery: ${batterySized.installedKwh} kWh at ${BATTERY_CAPEX_IDR_PER_KWH.toLocaleString(
        'id-ID',
      )} IDR/kWh ⇒ ${Math.round(batteryCapex).toLocaleString(
        'id-ID',
      )} IDR. Valued for backup/resilience and peak shaving, not simple energy-arbitrage payback.`,
    );
  }

  return {
    losses,
    dailyKwh: round(dailyKwh, 1),
    dailyLossKwh: round(dailyLossKwh, 1),
    monthlyKwh: round(monthlyKwh, 0),
    monthlyEnergyCost: round(monthlyEnergyCost, 0),
    annualLossCost: round(annualLossCost, 0),
    tariffIdrPerKwh: tariff,
    solar: {
      annualSavings: round(solarAnnualSavings, 0),
      capex: round(solarCapex, 0),
      ...(paybackYears !== undefined ? { paybackYears: round(paybackYears, 1) } : {}),
      lifetimeNet: round(solarLifetimeNet, 0),
    },
    battery: { capex: round(batteryCapex, 0) },
    notes,
  };
}
