import { STANDARDS_VERSION } from '../standards/version';
import { DIN_MODULE_WIDTH_MM } from '../standards/enclosure';
import type { CircuitInput, PanelInput } from '../types/project';
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
}

function computeCircuit(
  c: CircuitInput,
  panel: PanelInput,
  df: number,
  opts: ComputePanelOptions,
): CircuitComputation {
  const loadW = effectiveLoadW(c, opts);
  const isMotor = (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined;
  const ib = isMotor
    ? motorFLC(c.motorKw!, panel.voltageV)
    : loadCurrent({ powerW: loadW, voltageV: panel.voltageV, cosPhi: c.cosPhi, system: panel.system });
  const designCurrentA = round(ib, 1);

  const breaker = selectBreaker({ designCurrentA: ib, loadKind: c.loadKind });
  const isTrunk = c.role === 'incomer' || c.loadKind === 'feeder' || c.feedsPanelId !== undefined;
  const minSection = isTrunk ? 4 : 2.5;
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
    system: panel.system,
    voltageV: panel.voltageV,
    isLighting: c.isLighting,
  });

  let modules = panel.system === '3ph' ? 3 : 1; // branch breaker poles
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
    breaker,
    cable,
    voltageDrop: vd,
    control,
  };
  warnings.push(
    ...circuitWarnings(result, { deratingFactor: df, minSectionMm2: minSection, panelId: panel.id }),
  );

  return { result, warnings, modules: Math.ceil(modules), heatW: round(heatW, 1), floorGear, effectiveLoadW: loadW };
}

/** Compute all sizing, control, enclosure, busbar and warnings for one panel. */
export function computePanel(panel: PanelInput, opts: ComputePanelOptions = {}): PanelResult {
  const df = deratingFactor({
    ambientC: panel.ambientTempC,
    groupingCount: panel.groupingCount,
    installMethod: panel.installMethod,
  });

  const branches = panel.circuits.filter((c) => c.role === 'branch');
  const warnings: Warning[] = [];
  let totalConnectedLoadW = 0;
  let totalModules = panel.system === '3ph' ? 4 : 2; // incomer breaker
  let totalHeatW = 0;
  let hasFloorGear = false;

  const circuits: CircuitResult[] = branches.map((c) => {
    const comp = computeCircuit(c, panel, df, opts);
    totalConnectedLoadW += comp.effectiveLoadW;
    totalModules += comp.modules;
    totalHeatW += comp.heatW;
    if (comp.floorGear) hasFloorGear = true;
    warnings.push(...comp.warnings);
    return comp.result;
  });

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
    warnings,
    standardsVersion: STANDARDS_VERSION,
  };
}
