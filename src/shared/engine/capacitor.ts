import {
  PF_PENALTY_THRESHOLD,
  PF_TARGET_DEFAULT,
  capacitorStepKvar,
  selectCapacitorBankKvar,
} from '../standards/capacitor';
import type { ProjectInput } from '../types/project';
import type { CapacitorBankResult } from '../types/results';
import { derivedPointsLoadW } from './fixtures';
import { round } from './util';

function clampPf(pf: number): number {
  return Math.min(0.999, Math.max(0.3, pf));
}

/**
 * Aggregate the installation's real and reactive demand, derive the existing
 * power factor and, when it is below the penalty threshold, size a capacitor
 * bank to reach the target PF. VSD-driven loads present a near-unity input
 * displacement PF, so they are treated as ~0.95 (no significant reactive demand).
 */
export function computePowerFactor(
  project: ProjectInput,
  targetPf = PF_TARGET_DEFAULT,
): CapacitorBankResult {
  let kw = 0;
  let kvar = 0;

  for (const panel of project.panels) {
    for (const c of panel.circuits) {
      if (c.role !== 'branch' || c.feedsPanelId) continue; // leaf loads only
      const isMotor = (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined;
      // Point-modelled circuits (fixtures/sockets) derive their connected kW.
      const baseKw = isMotor ? c.motorKw! : (derivedPointsLoadW(c) ?? c.loadW) / 1000;
      const loadKw = baseKw * (c.demandFactor ?? 1);
      const pf = clampPf(c.starterType === 'VFD' ? 0.95 : c.cosPhi);
      const phi = Math.acos(pf);
      kw += loadKw;
      kvar += loadKw * Math.tan(phi);
    }
  }

  const kva = Math.hypot(kw, kvar);
  const existingPf = kva > 0 ? kw / kva : 1;
  const needed = existingPf < PF_PENALTY_THRESHOLD;

  let requiredKvar = 0;
  let bankKvar = 0;
  let steps = 0;
  let stepKvar = 0;
  if (existingPf < targetPf && kw > 0) {
    const phi1 = Math.acos(clampPf(existingPf));
    const phi2 = Math.acos(clampPf(targetPf));
    requiredKvar = kw * (Math.tan(phi1) - Math.tan(phi2));
    bankKvar = selectCapacitorBankKvar(requiredKvar);
    stepKvar = capacitorStepKvar(bankKvar);
    steps = Math.max(1, Math.round(bankKvar / stepKvar));
  }

  const note = needed
    ? `Power factor ${round(existingPf, 2)} is below the ${PF_PENALTY_THRESHOLD} PLN penalty threshold — fit a ${bankKvar} kVAR automatic bank (${steps} × ${stepKvar} kVAR) to reach ${targetPf}.`
    : existingPf < targetPf
      ? `Power factor ${round(existingPf, 2)} avoids the PLN penalty; a ${bankKvar} kVAR bank would raise it to ${targetPf} and cut losses.`
      : `Power factor ${round(existingPf, 2)} is already at/above target — no correction needed.`;

  return {
    totalKw: round(kw, 1),
    totalKvar: round(kvar, 1),
    existingPf: round(existingPf, 3),
    targetPf,
    needed,
    requiredKvar: round(requiredKvar, 1),
    bankKvar,
    steps,
    stepKvar,
    note,
  };
}
