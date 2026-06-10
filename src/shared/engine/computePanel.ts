import { STANDARDS_VERSION } from '../standards/version';
import { DIN_MODULE_WIDTH_MM } from '../standards/enclosure';
import { LOAD_DEFAULTS } from '../standards/loads';
import { MAX_BUSBAR_SECTION_CURRENT_A, MAX_WAYS_PER_BUSBAR } from '../standards/protection';
import type { CircuitInput, PanelInput } from '../types/project';
import type { SystemType, EarthingSystem } from '../types/electrical';
import type { CircuitResult, PanelResult, Warning } from '../types/results';
import { applyPumpControl } from './control/pumpControl';
import { applyStarterTemplate } from './control/applyStarterTemplate';
import { motorFLC, motorFLC1ph } from './control/motorFLC';
import { circuitDemandFactor } from './occupancy';
import { derivedPointsLoadW, finalCircuitWarnings, summarizeFinalCircuit } from './fixtures';
import { sizeCableTray, sizeCircuitConduit } from './containment';
import { deratingFactor } from './derating';
import { estimateEnclosure } from './enclosure';
import { loadCurrent } from './loadCurrent';
import { selectBreaker } from './breakerSelect';
import { sizeBusbar, splitBusbarSections } from './busbar';
import { checkBusbarWithstand } from './busbarFault';
import { verifyEnclosureThermal } from './enclosureThermal';
import { sizeCable } from './cableSizing';
import { balancePhases, circuitIsThreePhase } from './phase';
import { computeHarmonics, harmonicsWarnings } from './harmonics';
import { computeArcFlash, arcFlashWarnings } from './arcFlash';
import { checkBreakerKa, checkZs, type Impedance } from './fault';
import { circuitRcd, sizeGrounding } from './grounding';
import { round } from './util';
import { voltageDrop } from './voltageDrop';
import { circuitWarnings, protectionWarnings, validateInterlocks } from './warnings';

export interface ComputePanelOptions {
  /** Aggregated downstream demand (W) keyed by the child panel id a feeder serves. */
  feederLoadW?: Record<string, number>;
  /** Installation earthing system (drives RCD requirements). */
  earthingSystem?: EarthingSystem;
  /** Prospective 3-phase symmetrical fault current at this panel's bus (A). */
  faultLevelA?: number;
  /** Per-phase source impedance up to this panel's bus (ohm), for Zs. */
  sourceZ?: Impedance;
  /** Site soil thermal resistivity (K·m/W) — derates buried runs. */
  soilThermalResistivityKmW?: number;
}

/**
 * A leaf circuit's connected demand (W): motor kW for motors, else connected W,
 * times the demand factor. When the circuit carries point-level detail
 * (fixtures/sockets), the connected W is derived from the points and supersedes
 * the flat `loadW`. `demandFactor` lets the caller pass an occupancy-resolved
 * factor; absent, the circuit's own value (default 1) is used.
 */
export function circuitConnectedW(c: CircuitInput, demandFactor?: number): number {
  const isMotor = (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined;
  const df = demandFactor ?? c.demandFactor ?? 1;
  const baseW = isMotor ? c.motorKw! * 1000 : (derivedPointsLoadW(c) ?? c.loadW);
  return baseW * df;
}

function effectiveLoadW(c: CircuitInput, panel: PanelInput, opts: ComputePanelOptions): number {
  if (c.feedsPanelId && opts.feederLoadW && opts.feederLoadW[c.feedsPanelId] !== undefined) {
    return opts.feederLoadW[c.feedsPanelId]!;
  }
  return circuitConnectedW(c, circuitDemandFactor(c, panel));
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
  const loadW = effectiveLoadW(c, panel, opts);
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
  const motorLike = (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined;
  const isMotor = motorLike && threePhase;

  // Single-phase circuits on a three-phase panel run at the phase voltage (~230 V).
  const phaseVoltage = panel.system === '3ph' ? round(panel.voltageV / Math.sqrt(3), 0) : panel.voltageV;
  const circuitSystem: SystemType = threePhase ? '3ph' : '1ph';
  const useVoltage = threePhase ? panel.voltageV : phaseVoltage;

  // Motor FLC from the standard tables — including 1-phase machines, whose
  // efficiency makes the electrical input markedly larger than the shaft kW.
  const ib = isMotor
    ? motorFLC(c.motorKw!, panel.voltageV)
    : motorLike
      ? motorFLC1ph(c.motorKw!, phaseVoltage)
      : loadCurrent({ powerW: loadW, voltageV: useVoltage, cosPhi: c.cosPhi, system: circuitSystem });
  const designCurrentA = round(ib, 1);

  const breaker = selectBreaker({
    designCurrentA: ib,
    loadKind: c.loadKind,
    overrideA: c.breakerOverrideA,
  });
  const isTrunk = c.role === 'incomer' || isFeeder;
  const baseMinSection = isTrunk ? 4 : 2.5;
  const minSection = Math.max(baseMinSection, c.cableOverrideMm2 ?? 0);
  const insulation = panel.insulation ?? 'PVC';
  const cable = sizeCable({
    designCurrentA: ib,
    breakerRatingA: breaker.ratingA,
    deratingFactor: df,
    minSectionMm2: minSection,
    insulation,
    // Auto-upsize the cable so it also meets the 3%/5% voltage-drop limit; the
    // resulting `vd` below is then within limit by construction in normal cases,
    // and any residual over-limit is the genuinely-impossible (max-section) case.
    vd: {
      lengthM: c.lengthM,
      cosPhi: c.cosPhi,
      system: circuitSystem,
      voltageV: useVoltage,
      isLighting: c.isLighting,
    },
  });
  // Mark a manually pinned cable minimum so the UI can color it as an override.
  if (c.cableOverrideMm2 !== undefined) cable.overridden = true;
  // Equal parallel runs share the current, so the drop is per-run I over per-run CSA.
  const runsPerPhase = cable.runsPerPhase ?? 1;
  const vd = voltageDrop({
    currentA: ib / runsPerPhase,
    lengthM: c.lengthM,
    csaMm2: cable.csaMm2,
    cosPhi: c.cosPhi,
    system: circuitSystem,
    voltageV: useVoltage,
    isLighting: c.isLighting,
  });
  // Cores follow the load's neutral need: single-phase lighting fixtures and
  // line-only loads = 2-core (L+PE); items with a neutral = 3-core (L+N+PE).
  // Three-phase: motors/resistive line loads = 4-core (3L+PE); loads with a
  // neutral (distribution, single-phase parts) = 5-core (3L+N+PE).
  const hasNeutral = threePhase ? def.needsNeutral && !def.motorLike : c.loadKind !== 'lighting';
  const grounding = sizeGrounding({
    phaseCsaMm2: cable.csaMm2,
    panelSystem: panel.system,
    threePhase,
    hasNeutral,
    runsPerPhase,
    // XLPE multicore is N2XY; PVC keeps the NYY (3ph) / NYM (1ph) defaults.
    ...(insulation === 'XLPE' ? { cableType: 'N2XY' as const } : {}),
  });
  const rcd = circuitRcd({
    earthingSystem: opts.earthingSystem ?? 'TN-C-S',
    loadKind: c.loadKind,
    isFinalCircuit: !isFeeder,
    designCurrentA,
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
      variableTorque: c.loadKind === 'pump' || c.loadKind === 'hvac',
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

  const containment = sizeCircuitConduit(cable.csaMm2, grounding.cores);

  const result: CircuitResult = {
    circuitId: c.id,
    name: c.name,
    designCurrentA,
    phase: threePhase ? '3ph' : 'L1', // single-phase assignment finalised after balancing
    breaker,
    cable,
    voltageDrop: vd,
    grounding,
    rcd,
    control,
    containment,
  };

  // Protection / fault analysis (only when the panel's prospective fault is known).
  if (opts.faultLevelA !== undefined) {
    const prospectiveKa = round(opts.faultLevelA / 1000, 1);
    const ka = checkBreakerKa(breaker, prospectiveKa);
    result.breakerKa = ka.breakerKa;
    result.kaAdequate = ka.adequate;

    const zs = checkZs({
      earthingSystem: opts.earthingSystem ?? 'TN-C-S',
      sourceZ: opts.sourceZ ?? { rOhm: 0, xOhm: 0 },
      phaseCsaMm2: cable.csaMm2,
      peCsaMm2: grounding.peCsaMm2,
      lengthM: c.lengthM,
      curve: breaker.curve,
      breakerRatingA: breaker.ratingA,
      runsPerPhase,
      insulation,
    });
    result.zsOhm = zs.zsOhm;
    result.zsMaxOhm = zs.zsMaxOhm;
    result.disconnectsInTime = zs.disconnectsInTime;
    result.earthFaultA = zs.earthFaultA;
    result.peMinAdiabaticMm2 = zs.peMinAdiabaticMm2;
    result.peAdiabaticOk = zs.peAdiabaticOk;

    warnings.push(
      ...protectionWarnings(result, {
        earthingSystem: opts.earthingSystem ?? 'TN-C-S',
        prospectiveKa,
        panelId: panel.id,
      }),
    );
  }

  // Point-level (fixture / socket / switch-group) summary and checks.
  const finalCircuit = summarizeFinalCircuit(c);
  if (finalCircuit) {
    result.finalCircuit = finalCircuit;
    warnings.push(...finalCircuitWarnings(finalCircuit, { id: c.id, name: c.name }, panel.id));
  }

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
    insulation: panel.insulation,
    soilThermalResistivityKmW: opts.soilThermalResistivityKmW,
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

  // Busbar / incomer carry the worst-loaded phase's line current, not the scalar
  // sum of mixed single- and three-phase currents.
  const totalDemandCurrentA = round(
    panel.system === '3ph' ? Math.max(balance.L1, balance.L2, balance.L3) : balance.L1,
    1,
  );
  // Incoming device: the main breaker, snapped to a standard rating ≥ demand,
  // with poles per the system and a kA check at the bus (when fault is known).
  const incomerBreaker = selectBreaker({ designCurrentA: totalDemandCurrentA, loadKind: 'feeder' });
  const incomer: PanelResult['incomer'] = {
    breaker: incomerBreaker,
    poles: panel.system === '3ph' ? 4 : 2,
  };
  if (incomerBreaker.ratingA + 1e-9 < totalDemandCurrentA) {
    warnings.push({
      code: 'incomer-exceeds-range',
      severity: 'error',
      message: `${panel.name}: demand ${totalDemandCurrentA} A exceeds the largest standard breaker frame (${incomerBreaker.ratingA} A) — split the board or feed it at MV.`,
      panelId: panel.id,
    });
  }

  // Main bus rated for the incoming device (IEC 61439-1), not just the demand.
  const busbar = sizeBusbar(totalDemandCurrentA, incomerBreaker.ratingA);
  // Split the panel bus into capacity-bounded sections (max ways / max current),
  // so a panel with many ways gets several busbar lines instead of one giant bar.
  // Each section is sized for the worst-phase current of the ways it carries; the
  // line current of a way follows its phase assignment (3-phase ways load all
  // lines). The main `busbar` above stays the incoming bus (full panel demand).
  const busbarSections = splitBusbarSections(
    comps.map((cm, idx) => {
      const assigned = balance.assignment[cm.result.circuitId];
      return {
        id: cm.result.circuitId,
        designCurrentA: cm.result.designCurrentA,
        threePhase: cm.threePhase,
        phase: assigned === 'L2' || assigned === 'L3' ? assigned : 'L1',
        breakBefore: branches[idx]?.busbarBreakBefore === true,
      };
    }),
    {
      maxWays: MAX_WAYS_PER_BUSBAR,
      maxSectionCurrentA: MAX_BUSBAR_SECTION_CURRENT_A,
      system: panel.system,
    },
  );

  // Verify each bar can withstand the panel's prospective short-circuit (Icw), not
  // just carry the continuous load (when the fault level is known). A section bar
  // is sized for its own (smaller) load, so it can fail withstand even when the
  // main bus passes — warn per inadequate section.
  if (opts.faultLevelA !== undefined) {
    const faultKa = round(opts.faultLevelA / 1000, 1);
    const incomerKa = checkBreakerKa(incomerBreaker, faultKa);
    incomer.breakerKa = incomerKa.breakerKa;
    incomer.kaAdequate = incomerKa.adequate;
    if (!incomerKa.adequate) {
      warnings.push({
        code: 'incomer-ka-inadequate',
        severity: 'error',
        message: `${panel.name}: incomer ${incomerBreaker.ratingA} A breaking capacity ${incomerKa.breakerKa} kA is below the ${faultKa} kA prospective fault at the bus — specify a higher-Icu frame.`,
        panelId: panel.id,
      });
    }
    busbar.withstand = checkBusbarWithstand(busbar.csaMm2, faultKa);
    for (const section of busbarSections) {
      section.busbar.withstand = checkBusbarWithstand(section.busbar.csaMm2, faultKa);
      if (!section.busbar.withstand.adequate) {
        const where =
          busbarSections.length > 1 ? `${panel.name} busbar section ${section.index}` : panel.name;
        warnings.push({
          code: 'busbar-withstand-inadequate',
          severity: 'error',
          message: `${where}: busbar ${section.busbar.csaMm2} mm² short-circuit withstand Icw ${section.busbar.withstand.icwKa} kA is below the ${section.busbar.withstand.faultKa} kA prospective fault — increase the bar section, brace it, or use parallel bars.`,
          panelId: panel.id,
        });
      }
    }
  }
  const enclosure = estimateEnclosure({ modules: totalModules, totalHeatW, hasFloorGear });
  // Verify the internal temperature rise (IEC 61439-1 / 60890) and recommend an IP
  // rating; floor-standing assemblies dissipate through different faces than wall-
  // mounted ones.
  enclosure.thermal = verifyEnclosureThermal({
    widthMm: enclosure.widthMm,
    heightMm: enclosure.heightMm,
    depthMm: enclosure.depthMm,
    totalHeatW,
    mounting: hasFloorGear ? 'free-standing' : 'wall',
    ambientC: panel.ambientTempC,
  });
  if (!enclosure.thermal.withinLimit) {
    warnings.push({
      code: 'enclosure-overtemp',
      severity: 'warning',
      message: `${panel.name}: estimated internal temperature rise ${enclosure.thermal.tempRiseK} K (≈ ${enclosure.thermal.internalTempC} °C internal) exceeds the recommended limit — add ventilation/cooling or use a larger enclosure.`,
      panelId: panel.id,
    });
  }

  // Future-expansion headroom: busbar reserve over the present demand, and a
  // recommended spare-ways allowance (good practice ≥ 25% busbar / ~20% ways).
  const busbarHeadroomPct =
    busbar.ampacityA > 0
      ? round(((busbar.ampacityA - totalDemandCurrentA) / busbar.ampacityA) * 100, 0)
      : 0;
  const spare = {
    busbarHeadroomPct,
    meetsReserveTarget: busbarHeadroomPct >= 25,
    recommendedSpareWays: Math.max(3, Math.ceil(totalModules * 0.2)),
  };

  // Cable tray for all outgoing cables, laid side-by-side in a single layer.
  // Parallel runs occupy one tray slot per run.
  const cableTray = sizeCableTray(
    circuits.flatMap((c) =>
      Array.from({ length: c.cable.runsPerPhase ?? 1 }, () => c.containment?.cableOdMm ?? 0),
    ),
  );

  // Harmonics / power-quality estimate from the non-linear (VFD/soft-starter/
  // UPS/rectifier) load share. branches and comps are aligned by construction.
  const largestNeutralCsaMm2 = comps.reduce(
    (m, cm) => Math.max(m, cm.result.grounding.neutralCsaMm2),
    0,
  );
  const harmonics = computeHarmonics({
    loads: branches.map((b, idx) => ({
      loadW: comps[idx]!.effectiveLoadW,
      loadKind: b.loadKind,
      starterType: b.starterType,
      threePhase: comps[idx]!.threePhase,
    })),
    largestNeutralCsaMm2,
  });
  if (harmonics) warnings.push(...harmonicsWarnings(harmonics, panel.id));

  // Arc-flash incident-energy estimate at the bus (needs the prospective fault).
  // The clearing device is approximated by the panel's heaviest breaker class —
  // an MCCB-fed bus is assumed to clear more slowly than an MCB-only board.
  let arcFlash;
  if (opts.faultLevelA !== undefined) {
    const incomerClass = comps.some((cm) => cm.result.breaker.deviceClass === 'MCCB')
      ? 'MCCB'
      : 'MCB';
    arcFlash = computeArcFlash({
      boltedFaultA: opts.faultLevelA,
      voltageV: panel.voltageV,
      incomerClass,
    });
    if (arcFlash) warnings.push(...arcFlashWarnings(arcFlash, panel.id));
  }

  return {
    panelId: panel.id,
    name: panel.name,
    ...(panel.tag ? { tag: panel.tag } : {}),
    circuits,
    incomer,
    busbar,
    busbarSections,
    enclosure,
    totalConnectedLoadW: round(totalConnectedLoadW, 0),
    totalDemandCurrentA,
    spare,
    phaseBalance: {
      L1: balance.L1,
      L2: balance.L2,
      L3: balance.L3,
      imbalancePct: balance.imbalancePct,
    },
    warnings,
    standardsVersion: STANDARDS_VERSION,
    cableTray,
    ...(opts.faultLevelA !== undefined ? { faultLevelKa: round(opts.faultLevelA / 1000, 1) } : {}),
    ...(harmonics ? { harmonics } : {}),
    ...(arcFlash ? { arcFlash } : {}),
  };
}
