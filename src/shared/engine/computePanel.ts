import { STANDARDS_VERSION } from '../standards/version';
import { DIN_MODULE_WIDTH_MM } from '../standards/enclosure';
import { LOAD_DEFAULTS } from '../standards/loads';
import type { CircuitInput, PanelInput } from '../types/project';
import type { SystemType } from '../types/electrical';
import type { CircuitResult, PanelResult, Warning } from '../types/results';
import { applyPumpControl } from './control/pumpControl';
import { applyStarterTemplate } from './control/applyStarterTemplate';
import { motorFLC } from './control/motorFLC';
import { deratingFactor } from './derating';
import { estimateEnclosure } from './enclosure';
import { loadCurrent } from './loadCurrent';
import { selectBreaker } from './breakerSelect';
import { sizeBusbar } from './busbar';
import { sizeCable } from './cableSizing';
import { balancePhases, circuitIsThreePhase } from './phase';
import { sizeGrounding } from './grounding';
import { round } from './util';
import { voltageDrop } from './voltageDrop';
import { circuitWarnings, validateInterlocks } from './warnings';

export interface ComputePanelOptions {
  /** Aggregated downstream demand (W) keyed by the child panel id a feeder serves. */
  feederLoadW?: Record<string, number>;
}

function effectiveLoadW(c: CircuitInput, opts: ComputePanelOptions): number {
  if (c.feedsPanelId && opts.feederLoadW && opts.feederLoadW[c.feedsPanelId] !== undefined) {
    return opts.feederLoadW[c.feedsPanelId]!;
  }
  return c.loadW * (c.demandFactor ?? 1);
}

interface CircuitComputation {
  result: CircuitResult;
  warnings: Warning[];
  modules: number;
  heatW: number;
  floorGear: boolean;
  effectiveLoadW: number;
  threePhase: boolean;
}

function computeCircuit(
  c: CircuitInput,
  panel: PanelInput,
  df: number,
  opts: ComputePanelOptions,
): CircuitComputation {
  const loadW = effectiveLoadW(c, opts);
  const def = LOAD_DEFAULTS[c.loadKind];
  const isFeeder = c.loadKind === 'feeder' || c.feedsPanelId !== undefined;

  const threePhase = circuitIsThreePhase({
    panelSystem: panel.system,
    kind: c.loadKind,
    loadW,
    motorKw: c.motorKw,
    hasStarter: Boolean(c.starterType),
    isFeeder,
  });
  const isMotor =
    (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined && threePhase;

  // Single-phase circuits on a three-phase panel run at the phase voltage (~230 V).
  const phaseVoltage = panel.system === '3ph' ? round(panel.voltageV / Math.sqrt(3), 0) : panel.voltageV;
  const circuitSystem: SystemType = threePhase ? '3ph' : '1ph';
  const useVoltage = threePhase ? panel.voltageV : phaseVoltage;

  const ib = isMotor
    ? motorFLC(c.motorKw!, panel.voltageV)
    : loadCurrent({ powerW: loadW, voltageV: useVoltage, cosPhi: c.cosPhi, system: circuitSystem });
  const designCurrentA = round(ib, 1);

  const breaker = selectBreaker({ designCurrentA: ib, loadKind: c.loadKind });
  const isTrunk = c.role === 'incomer' || isFeeder;
  const baseMinSection = isTrunk ? 4 : 2.5;
  const minSection = Math.max(baseMinSection, c.cableOverrideMm2 ?? 0);
  const cable = sizeCable({
    designCurrentA: ib,
    breakerRatingA: breaker.ratingA,
    deratingFactor: df,
    minSectionMm2: minSection,
  });
  const vd = voltageDrop({
    currentA: ib,
    lengthM: c.lengthM,
    csaMm2: cable.csaMm2,
    cosPhi: c.cosPhi,
    system: circuitSystem,
    voltageV: useVoltage,
    isLighting: c.isLighting,
  });
  const grounding = sizeGrounding({
    phaseCsaMm2: cable.csaMm2,
    panelSystem: panel.system,
    threePhase,
    // three-phase motor-like loads typically have no neutral (4-core + PE)
    hasNeutral: threePhase ? !def.motorLike : true,
  });

  let modules = threePhase ? 3 : 1; // branch breaker poles
  let heatW = 0;
  let floorGear = false;
  const warnings: Warning[] = [];

  let control;
  if (c.starterType && c.motorKw !== undefined) {
    control = applyStarterTemplate({
      circuitId: c.id,
      starterType: c.starterType,
      motorKw: c.motorKw,
      motorPoles: c.motorPoles,
      voltageV: panel.voltageV,
      startingDuty: c.startingDuty,
    });
    if (c.controlMode) control = applyPumpControl(control, c.controlMode, c.sensing);
    for (const d of control.devices) {
      const qty = d.qty ?? 1;
      modules += ((d.widthMm ?? 0) / DIN_MODULE_WIDTH_MM) * qty;
      heatW += (d.heatLossW ?? 0) * qty;
      if (d.category === 'vfd' || d.category === 'soft_starter') floorGear = true;
    }
    warnings.push(...validateInterlocks(control, panel.id));
  }

  const result: CircuitResult = {
    circuitId: c.id,
    name: c.name,
    designCurrentA,
    phase: threePhase ? '3ph' : 'L1', // single-phase assignment finalised after balancing
    breaker,
    cable,
    voltageDrop: vd,
    grounding,
    control,
  };
  warnings.push(
    ...circuitWarnings(result, { deratingFactor: df, minSectionMm2: minSection, panelId: panel.id }),
  );

  return {
    result,
    warnings,
    modules: Math.ceil(modules),
    heatW: round(heatW, 1),
    floorGear,
    effectiveLoadW: loadW,
    threePhase,
  };
}

/** Compute all sizing, control, phase balance, enclosure, busbar and warnings for one panel. */
export function computePanel(panel: PanelInput, opts: ComputePanelOptions = {}): PanelResult {
  const df = deratingFactor({
    ambientC: panel.ambientTempC,
    groupingCount: panel.groupingCount,
    installMethod: panel.installMethod,
  });

  const branches = panel.circuits.filter((c) => c.role === 'branch');
  const comps = branches.map((c) => computeCircuit(c, panel, df, opts));

  // distribute single-phase circuits across phases and report imbalance
  const balance = balancePhases(
    comps.map((cm) => ({
      id: cm.result.circuitId,
      threePhase: cm.threePhase,
      currentA: cm.result.designCurrentA,
    })),
    panel.system,
  );
  for (const cm of comps) {
    cm.result.phase = balance.assignment[cm.result.circuitId] ?? cm.result.phase;
  }

  const warnings: Warning[] = [];
  let totalConnectedLoadW = 0;
  let totalModules = panel.system === '3ph' ? 4 : 2; // incomer breaker
  let totalHeatW = 0;
  let hasFloorGear = false;

  for (const cm of comps) {
    totalConnectedLoadW += cm.effectiveLoadW;
    totalModules += cm.modules;
    totalHeatW += cm.heatW;
    if (cm.floorGear) hasFloorGear = true;
    warnings.push(...cm.warnings);
  }

  const circuits = comps.map((cm) => cm.result);

  if (panel.system === '3ph' && balance.imbalancePct > 15) {
    warnings.push({
      code: 'phase-imbalance',
      severity: 'warning',
      message: `Phase loading is unbalanced by ${balance.imbalancePct}% (L1 ${balance.L1} A, L2 ${balance.L2} A, L3 ${balance.L3} A). Redistribute single-phase circuits.`,
      panelId: panel.id,
    });
  }

  const totalDemandCurrentA = round(
    circuits.reduce((s, c) => s + c.designCurrentA, 0),
    1,
  );
  const busbar = sizeBusbar(totalDemandCurrentA);
  const enclosure = estimateEnclosure({ modules: totalModules, totalHeatW, hasFloorGear });

  return {
    panelId: panel.id,
    name: panel.name,
    circuits,
    busbar,
    enclosure,
    totalConnectedLoadW: round(totalConnectedLoadW, 0),
    totalDemandCurrentA,
    phaseBalance: {
      L1: balance.L1,
      L2: balance.L2,
      L3: balance.L3,
      imbalancePct: balance.imbalancePct,
    },
    warnings,
    standardsVersion: STANDARDS_VERSION,
  };
}
