import type { ProjectInput } from '../types/project';
import type { PanelResult, SelectivityEntry, SystemResult, Warning } from '../types/results';
import { peConductorSize } from '../standards/grounding';
import { circuitConnectedW, computePanel } from './computePanel';
import { circuitDemandFactor, effectiveDiversityFactor } from './occupancy';
import { determineSupply } from './transformer';
import { ASSUMED_BUILDING_PF } from '../standards/transformer';
import { computeSources } from './sources';
import { computeEarthing } from './grounding';
import { computePowerFactor } from './capacitor';
import { computeMetering } from './metering';
import { recommendSpd, SECONDARY_SPD_DISTANCE_M } from './spd';
import {
  type Impedance,
  SELECTIVITY_RATIO,
  addImpedance,
  checkZs,
  conductorImpedance,
  downstreamFaultA,
  generatorFaultA,
  mainBusFaultA,
  nonSelective,
  sourceImpedanceFromIsc,
} from './fault';
import { selectBreaker } from './breakerSelect';
import { sizeCable } from './cableSizing';
import { CURVE_TRIP_MULTIPLE_LOWER } from '../standards/fault';
import { round } from './util';

/**
 * Compute a whole project (building) by walking the panel feeder tree
 * bottom-up: each sub-panel's diversified demand is fed into its parent's feeder
 * circuit, which is then sized from that aggregated load. Rejects feeder cycles.
 */
export function computeSystem(project: ProjectInput): SystemResult {
  const panels = project.panels;
  const byId = new Map(panels.map((p) => [p.id, p]));
  const warnings: Warning[] = [];

  // child panel id -> parent panel id (the panel containing its feeder circuit)
  const parentOf = new Map<string, string>();
  for (const p of panels) {
    for (const c of p.circuits) {
      if (c.feedsPanelId) parentOf.set(c.feedsPanelId, p.id);
    }
  }

  // Each panel's system, so feeders can follow the panel they FEED (a 1-ph
  // sub-board gets a 1-ph feeder). A 3-ph child under a 1-ph parent is
  // physically impossible — one phase cannot supply three.
  const panelSystems = Object.fromEntries(panels.map((p) => [p.id, p.system]));
  for (const [childId, parentId] of parentOf) {
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    if (child?.system === '3ph' && parent?.system === '1ph') {
      warnings.push({
        code: 'feeder-phase-mismatch',
        severity: 'error',
        message: `${child.name}: a three-phase panel cannot be fed from the single-phase ${parent.name} — change one of the panel systems or re-parent the feeder.`,
        panelId: childId,
      });
    }
  }

  // Post-order DFS from roots so children are computed before parents.
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const postOrder: string[] = [];
  let cycle = false;

  const childrenOf = (id: string) => panels.filter((p) => parentOf.get(p.id) === id);

  const dfs = (id: string): void => {
    if (inStack.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    inStack.add(id);
    for (const child of childrenOf(id)) dfs(child.id);
    inStack.delete(id);
    visited.add(id);
    postOrder.push(id);
  };

  const roots = panels.filter((p) => !parentOf.has(p.id));
  for (const r of roots) dfs(r.id);

  // Anything unreached is inside a cycle (no valid root).
  for (const p of panels) {
    if (!visited.has(p.id)) {
      cycle = true;
      postOrder.push(p.id);
      visited.add(p.id);
    }
  }
  if (cycle) {
    warnings.push({
      code: 'feeder-cycle',
      severity: 'error',
      message: 'Feeder topology contains a cycle; system aggregation may be incomplete.',
    });
  }

  const earthingSystem = project.earthingSystem ?? 'TN-C-S';

  // The feeder loads each panel presents to its parent, plus the diversified
  // demand it pushes upstream. Computed leaf-first so a parent sees its children's
  // demand. Demand depends only on connected load, so it is summed cheaply here
  // (the full sizing is done once below, in the fault pass).
  const feederLoadWByPanel = new Map<string, Record<string, number>>();
  const panelDemandW = new Map<string, number>(); // panel id -> demand pushed upstream
  for (const id of postOrder) {
    const panel = byId.get(id);
    if (!panel) continue;
    const feederLoadW: Record<string, number> = {};
    let connectedW = 0;
    for (const c of panel.circuits) {
      if (c.role !== 'branch') continue;
      const load = c.feedsPanelId
        ? (panelDemandW.get(c.feedsPanelId) ?? 0)
        : circuitConnectedW(c, circuitDemandFactor(c, panel));
      if (c.feedsPanelId) feederLoadW[c.feedsPanelId] = load;
      connectedW += load;
    }
    feederLoadWByPanel.set(id, feederLoadW);
    panelDemandW.set(id, connectedW * effectiveDiversityFactor(panel));
  }

  // True building connected load = leaf loads only (feeders are aggregations, so
  // summing every panel's total would double-count sub-panels).
  const connectedLoadW = project.panels.reduce(
    (sum, p) =>
      sum +
      p.circuits.reduce(
        (s, c) =>
          s +
          (c.role === 'branch' && !c.feedsPanelId
            ? circuitConnectedW(c, circuitDemandFactor(c, p))
            : 0),
        0,
      ),
    0,
  );

  // Determine the supply (LV direct vs MV + transformer) from the diversified
  // demand presented by the root panel(s). kVA = kW / power-factor.
  const rootDemandW = roots.reduce((s, p) => s + (panelDemandW.get(p.id) ?? 0), 0);
  const lvVoltageV = roots[0]?.voltageV ?? 400;
  const totalDemandKva = rootDemandW / 1000 / ASSUMED_BUILDING_PF;
  const supply = determineSupply(totalDemandKva, lvVoltageV, {
    dual: project.meta?.dualTransformer === true,
  });
  // Flagged-panel demand (essential → genset, UPS-backed → battery): a panel
  // under a flagged ancestor is already inside that ancestor's demand, so only
  // the TOPMOST flagged panels are summed (double-count free).
  const hasFlaggedAncestor = (id: string, flagged: (p: (typeof panels)[number]) => boolean): boolean => {
    let cur = parentOf.get(id);
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur)) {
      const p = byId.get(cur);
      if (p && flagged(p)) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };
  const topmostFlaggedW = (flagged: (p: (typeof panels)[number]) => boolean): number =>
    project.panels
      .filter((p) => flagged(p) && !hasFlaggedAncestor(p.id, flagged))
      .reduce((s, p) => s + (panelDemandW.get(p.id) ?? 0), 0);

  const isEssential = (p: (typeof panels)[number]) => p.essential === true;
  const hasEssentialAncestor = (id: string) => hasFlaggedAncestor(id, isEssential);
  const essentialPanels = project.panels.filter(isEssential);
  const essential = {
    demandKva: round(topmostFlaggedW(isEssential) / 1000 / ASSUMED_BUILDING_PF, 1),
    panelCount: essentialPanels.length,
  };

  // UPS-backed (critical) panels drive the battery backup power (real kW).
  const isCritical = (p: (typeof panels)[number]) => p.upsBacked === true;
  const criticalPanels = project.panels.filter(isCritical);
  const critical = {
    demandKw: round(topmostFlaggedW(isCritical) / 1000, 1),
    panelCount: criticalPanels.length,
  };

  // Building motors (for the genset motor-start voltage-dip check). With an
  // essential bus only its subtree runs on the genset — assess those motors.
  const motorPanels =
    essential.panelCount > 0
      ? project.panels.filter((p) => p.essential === true || hasEssentialAncestor(p.id))
      : project.panels;
  const motors = motorPanels.flatMap((p) =>
    p.circuits
      .filter((c) => c.motorKw !== undefined && c.motorKw > 0)
      .map((c) => ({ name: c.name, kW: c.motorKw!, starterType: c.starterType })),
  );
  const sources = computeSources(project.sources, totalDemandKva, motors, essential, critical);

  if (
    essential.panelCount > 0 &&
    !(project.sources?.generator?.enabled || project.sources?.battery?.enabled)
  ) {
    warnings.push({
      code: 'essential-no-backup',
      severity: 'warning',
      message: `${essential.panelCount} panel(s) are marked essential but no generator or battery is enabled — nothing keeps them alive on mains failure.`,
    });
  }

  if (critical.panelCount > 0 && !project.sources?.battery?.enabled) {
    warnings.push({
      code: 'critical-no-battery',
      severity: 'warning',
      message: `${critical.panelCount} panel(s) are marked UPS-backed but no battery is enabled — nothing rides them through an outage. Enable the battery under Energy sources.`,
    });
  }

  // Life-safety circuits must remain supplied on mains failure: they need a
  // backup source, and (when an essential bus exists) they must be ON it.
  const lifeSafetyPanels = project.panels.filter((p) =>
    p.circuits.some((c) => c.lifeSafety === true),
  );
  if (lifeSafetyPanels.length > 0 && !project.sources?.generator?.enabled) {
    warnings.push({
      code: 'life-safety-no-backup',
      severity: 'warning',
      message: `Life-safety circuits exist (fire pump / emergency lighting) but no generator is enabled — they would die with the mains. Enable a genset (and mark their panels essential).`,
    });
  }
  if (
    lifeSafetyPanels.length > 0 &&
    project.sources?.generator?.enabled &&
    project.sources.generator.transfer === 'manual'
  ) {
    warnings.push({
      code: 'life-safety-manual-transfer',
      severity: 'warning',
      message:
        'Life-safety circuits are backed through a MANUAL changeover (COS) — the fire pump waits for an operator. Use an automatic transfer switch (ATS).',
    });
  }
  if (essential.panelCount > 0) {
    for (const p of lifeSafetyPanels) {
      if (p.essential === true || hasEssentialAncestor(p.id)) continue;
      const names = p.circuits.filter((c) => c.lifeSafety === true).map((c) => c.name).join(', ');
      warnings.push({
        code: 'life-safety-not-backed',
        severity: 'warning',
        message: `${p.name}: life-safety circuit(s) ${names} sit outside the essential bus — the ATS will drop them on mains failure. Mark this panel essential or move the circuits.`,
        panelId: p.id,
      });
    }
  }

  // Prospective fault at the origin (main LV bus) and the source impedance behind
  // it. Each panel's bus fault decays down its feeder run from its parent's bus.
  const originFaultA = mainBusFaultA(supply);
  const panelFaultA = new Map<string, number>();
  const panelSourceZ = new Map<string, Impedance>();

  // Compute each panel root-first: a panel's source fault/impedance is its parent's
  // bus value plus the feeder cable down to it, so parents must be sized first.
  const results: Record<string, PanelResult> = {};
  for (const id of [...postOrder].reverse()) {
    const panel = byId.get(id);
    if (!panel) continue;
    const parentId = parentOf.get(id);

    let faultA = originFaultA;
    let sourceZ: Impedance = sourceImpedanceFromIsc(originFaultA, lvVoltageV);
    if (parentId !== undefined) {
      const parentFaultA = panelFaultA.get(parentId) ?? originFaultA;
      const parentZ = panelSourceZ.get(parentId) ?? sourceZ;
      // The feeder serving this panel is the parent circuit whose feedsPanelId is us.
      const parent = byId.get(parentId);
      const feeder = parent?.circuits.find((c) => c.feedsPanelId === id);
      const feederResult = results[parentId]?.circuits.find((c) => c.circuitId === feeder?.id);
      if (feeder && feederResult) {
        const feederRuns = feederResult.cable.runsPerPhase ?? 1;
        const fz = conductorImpedance(
          feederResult.cable.csaMm2,
          feeder.lengthM,
          byId.get(parentId)?.material ?? 'Cu',
        );
        sourceZ = addImpedance(parentZ, { rOhm: fz.rOhm / feederRuns, xOhm: fz.xOhm / feederRuns });
        faultA = downstreamFaultA(panel.voltageV, sourceZ, parentFaultA);
      } else {
        sourceZ = parentZ;
        faultA = parentFaultA;
      }
    }
    panelFaultA.set(id, faultA);
    panelSourceZ.set(id, sourceZ);

    const pr = computePanel(panel, {
      feederLoadW: feederLoadWByPanel.get(id) ?? {},
      panelSystems,
      earthingSystem,
      faultLevelA: faultA,
      sourceZ,
      soilThermalResistivityKmW: project.site?.soilThermalResistivityKmW,
    });
    results[id] = pr;
    pr.warnings.forEach((w) => warnings.push(w));
  }

  // Cumulative (origin → load) voltage drop down the feeder tree. Each segment's
  // %drop is referenced to its own nominal voltage and summed along the path —
  // the conventional way PUIL/IEC express total drop from the origin. A branch
  // whose cumulative drop exceeds its 3%/5% limit is flagged even when its own
  // segment is within limit (auto-sizing only controls the per-segment drop).
  const panelUpstreamDropPct = new Map<string, number>();
  for (const id of [...postOrder].reverse()) {
    // root-first
    const parentId = parentOf.get(id);
    let upstream = 0;
    if (parentId !== undefined) {
      const parent = byId.get(parentId);
      const feeder = parent?.circuits.find((c) => c.feedsPanelId === id);
      const feederResult = results[parentId]?.circuits.find((c) => c.circuitId === feeder?.id);
      upstream = (panelUpstreamDropPct.get(parentId) ?? 0) + (feederResult?.voltageDrop.dropPercent ?? 0);
    }
    upstream = round(upstream, 2);
    panelUpstreamDropPct.set(id, upstream);

    const pr = results[id];
    if (!pr) continue;
    // Feeder circuit ids in this panel — their cumulative drop is the sub-bus
    // drop that downstream branches already account for, so we don't warn on them.
    const feederIds = new Set(
      (byId.get(id)?.circuits ?? []).filter((x) => x.feedsPanelId).map((x) => x.id),
    );
    for (const c of pr.circuits) {
      const cum = round(upstream + c.voltageDrop.dropPercent, 2);
      c.cumulativeDropPercent = cum;
      if (!feederIds.has(c.circuitId) && cum > c.voltageDrop.limitPercent + 1e-9) {
        const w: Warning = {
          code: 'cumulative-voltage-drop-exceeded',
          severity: 'warning',
          message: `${c.name}: cumulative voltage drop ${cum}% from the origin exceeds the ${c.voltageDrop.limitPercent}% limit (this run ${c.voltageDrop.dropPercent}% + ${upstream}% upstream) — shorten the run, upsize the feeder, or relocate the load closer.`,
          panelId: id,
          circuitId: c.circuitId,
        };
        pr.warnings.push(w);
        warnings.push(w);
      }
    }
  }

  // --- Alternate-source (generator) fault & ADS study. ---
  // On genset supply the sustained fault collapses to ~3× generator FLC — the
  // worst case for automatic disconnection: a loop verified against the stiff
  // utility may never reach the breaker's magnetic threshold on the genset.
  // Re-run the Zs check per TN circuit with the generator's source impedance and
  // flag circuits that disconnect on mains but NOT on the generator.
  let generatorFaultKa: number | undefined;
  if (sources?.generator && earthingSystem !== 'TT') {
    const genFaultA = generatorFaultA(sources.generator.ratingKva, lvVoltageV);
    generatorFaultKa = round(genFaultA / 1000, 2);
    const genRootZ = sourceImpedanceFromIsc(genFaultA, lvVoltageV);

    // Source impedance per panel under generator supply (same feeder chain).
    const panelGenZ = new Map<string, Impedance>();
    for (const id of [...postOrder].reverse()) {
      const parentId = parentOf.get(id);
      let z = genRootZ;
      if (parentId !== undefined) {
        const parentZ = panelGenZ.get(parentId) ?? genRootZ;
        const parent = byId.get(parentId);
        const feeder = parent?.circuits.find((c) => c.feedsPanelId === id);
        const feederResult = results[parentId]?.circuits.find((c) => c.circuitId === feeder?.id);
        if (feeder && feederResult) {
          const feederRuns = feederResult.cable.runsPerPhase ?? 1;
          const fz = conductorImpedance(
            feederResult.cable.csaMm2,
            feeder.lengthM,
            byId.get(parentId)?.material ?? 'Cu',
          );
          z = addImpedance(parentZ, { rOhm: fz.rOhm / feederRuns, xOhm: fz.xOhm / feederRuns });
        } else {
          z = parentZ;
        }
      }
      panelGenZ.set(id, z);

      const panel = byId.get(id);
      const pr = results[id];
      if (!panel || !pr) continue;
      const genZ = panelGenZ.get(id)!;
      for (const cr of pr.circuits) {
        // Only re-check circuits that pass ADS on mains — a mains failure is
        // already an error; this surfaces the genset-only regression.
        if (cr.disconnectsInTime !== true) continue;
        const input = panel.circuits.find((c) => c.id === cr.circuitId);
        if (!input) continue;
        const genZs = checkZs({
          earthingSystem,
          sourceZ: genZ,
          phaseCsaMm2: cr.cable.csaMm2,
          peCsaMm2: cr.grounding.peCsaMm2,
          lengthM: input.lengthM,
          curve: cr.breaker.curve,
          breakerRatingA: cr.breaker.ratingA,
          runsPerPhase: cr.cable.runsPerPhase ?? 1,
          insulation: panel.insulation ?? 'PVC',
          material: panel.material ?? 'Cu',
        });
        if (!genZs.disconnectsInTime) {
          const w: Warning = {
            code: 'ads-fails-on-generator',
            severity: 'warning',
            message: `${cr.name}: earth-fault disconnection is verified on mains but NOT on the ${sources.generator.ratingKva} kVA generator (Zs ${genZs.zsOhm} Ω > ${genZs.zsMaxOhm} Ω at the genset's ~${generatorFaultKa} kA sustained fault) — add an RCD to the circuit or lower the loop impedance.`,
            panelId: id,
            circuitId: cr.circuitId,
          };
          pr.warnings.push(w);
          warnings.push(w);
        }
      }
    }
  }

  // Current-based selectivity between cascaded breakers (feeder vs sub-panel).
  const selectivity = selectivityReport(project, results, parentOf);
  for (const e of selectivity) {
    if (!e.selective) {
      warnings.push({
        code: 'selectivity-risk',
        severity: 'warning',
        message: `Feeder "${e.upstreamName}" (${e.upstreamRatingA} A) may not discriminate with ${e.downstreamName}'s ${e.downstreamRatingA} A branch — ${e.marginNote} Verify with manufacturer curves.`,
        panelId: e.upstreamPanelId,
        circuitId: e.upstreamCircuitId,
      });
    } else if (e.scSelective === false && e.selectivityLimitA !== undefined) {
      // Overload-discriminating, but a thermal-magnetic cascade only discriminates
      // up to the upstream's instantaneous pickup; above it both trip together.
      warnings.push({
        code: 'selectivity-partial',
        severity: 'info',
        message: `Feeder "${e.upstreamName}" (${e.upstreamRatingA} A) discriminates with ${e.downstreamName} on overload, but only up to ~${e.selectivityLimitA} A; the ${round((e.downstreamFaultA ?? 0) / 1000, 1)} kA prospective fault there exceeds this, so short-circuit selectivity is only partial — confirm with manufacturer let-through / discrimination tables.`,
        panelId: e.upstreamPanelId,
        circuitId: e.upstreamCircuitId,
      });
    }
  }

  // Earthing system designed from the main incomer's PE conductor.
  const mainResult = roots[0] ? results[roots[0].id] : undefined;
  const mainIb = mainResult?.totalDemandCurrentA ?? 0;
  const mainBreaker = selectBreaker({ designCurrentA: mainIb, loadKind: 'feeder' });
  const mainCable = sizeCable({
    designCurrentA: mainIb,
    breakerRatingA: mainBreaker.ratingA,
    deratingFactor: 1,
    minSectionMm2: 4,
  });
  const earthing = computeEarthing(
    project.earthingSystem ?? 'TN-C-S',
    peConductorSize(mainCable.csaMm2),
    project.site?.soilResistivityOhmM,
  );
  // PF correction sized to the project's target (meta override or 0.95). When
  // any panel reports non-trivial harmonics, the bank must be detuned.
  // Secondary SPDs: a sub-board far from the origin (> ~10 m of feeder) sits
  // outside the origin SPD's protective distance — recommend a Type 2 there
  // (IEC 61643-12 oscillation/distance rule).
  {
    const cumFeederM = new Map<string, number>();
    for (const id of [...postOrder].reverse()) {
      const parentId = parentOf.get(id);
      if (parentId === undefined) {
        cumFeederM.set(id, 0);
        continue;
      }
      const feeder = byId.get(parentId)?.circuits.find((c) => c.feedsPanelId === id);
      const dist = (cumFeederM.get(parentId) ?? 0) + (feeder?.lengthM ?? 0);
      cumFeederM.set(id, dist);
      const pr = results[id];
      if (pr && dist > SECONDARY_SPD_DISTANCE_M) {
        pr.spd = recommendSpd({
          earthingSystem,
          hasExternalLps: project.site?.externalLps ?? false,
          overheadSupply: project.site?.overheadSupply ?? false,
          atOrigin: false,
        });
      }
    }
  }

  const harmonicRich = Object.values(results).some(
    (pr) => pr.harmonics !== undefined && pr.harmonics.thdBand !== 'low',
  );
  const powerFactor = computePowerFactor(project, project.meta?.targetPf, harmonicRich);

  // PLN service step + revenue metering at the origin (direct vs CT-operated).
  const metering = computeMetering(totalDemandKva, lvVoltageV, roots[0]?.system ?? '3ph');

  // PLN rooftop-PV rule (Permen ESDM): the PV inverter capacity may not exceed
  // the connected power (daya tersambung) the customer subscribes to.
  if (sources?.solar && sources.solar.inverterKw * 1000 > metering.serviceVa) {
    warnings.push({
      code: 'pv-exceeds-service',
      severity: 'warning',
      message: `Solar inverter ${sources.solar.inverterKw} kW exceeds the PLN connected power (${Math.round(metering.serviceVa / 1000)} kVA) — rooftop-PV rules cap inverter capacity at the subscribed daya tersambung. Reduce the array/inverter or raise the service.`,
    });
  }

  // Surge-protection recommendation at the service origin (Type 1 under a
  // lightning/overhead exposure, else Type 2), keyed to the earthing system.
  const spd = recommendSpd({
    earthingSystem,
    hasExternalLps: project.site?.externalLps ?? false,
    overheadSupply: project.site?.overheadSupply ?? false,
    atOrigin: true,
  });

  return {
    projectId: project.id,
    panels: results,
    order: [...postOrder].reverse(), // root-first
    supply,
    earthing,
    powerFactor,
    spd,
    metering,
    ...(sources ? { sources } : {}),
    ...(generatorFaultKa !== undefined ? { generatorFaultKa } : {}),
    ...(selectivity.length > 0 ? { selectivity } : {}),
    totals: { connectedLoadW: Math.round(connectedLoadW), panelCount: panels.length },
    warnings,
  };
}

/**
 * Current-based discrimination report across the feeder tree. For each sub-panel,
 * compare its upstream feeder breaker (in the parent) against the most onerous
 * downstream device — the panel's largest branch breaker — and report the rating
 * ratio and the discrimination margin. `selective` flags whether the ratio meets
 * the rule-of-thumb threshold; full selectivity needs manufacturer time-current
 * / let-through curves. computeSystem turns each non-selective pair into a
 * 'selectivity-risk' warning.
 */
function selectivityReport(
  project: ProjectInput,
  results: Record<string, PanelResult>,
  parentOf: Map<string, string>,
): SelectivityEntry[] {
  const out: SelectivityEntry[] = [];
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  for (const [childId, parentId] of parentOf) {
    const parent = byId.get(parentId);
    const feeder = parent?.circuits.find((c) => c.feedsPanelId === childId);
    if (!feeder) continue;
    const feederResult = results[parentId]?.circuits.find((c) => c.circuitId === feeder.id);
    const childResult = results[childId];
    if (!feederResult || !childResult) continue;

    const upstreamIn = feederResult.breaker.ratingA;
    // Most onerous downstream device = the child panel's largest branch breaker.
    const downstreamIn = childResult.circuits.reduce((m, c) => Math.max(m, c.breaker.ratingA), 0);
    if (downstreamIn <= 0) continue;

    const ratio = round(upstreamIn / downstreamIn, 2);
    const selective = !nonSelective(upstreamIn, downstreamIn);
    const requiredA = Math.ceil(downstreamIn * SELECTIVITY_RATIO);
    const marginNote = selective
      ? `ratio ${ratio} ≥ ${SELECTIVITY_RATIO}× — discriminates (screen).`
      : `upstream rating below ${requiredA} A (${SELECTIVITY_RATIO}×); ratio ${ratio}.`;

    // Short-circuit discrimination ceiling: the upstream device stays out of its
    // instantaneous region (so only the downstream trips) up to its lower magnetic
    // pickup. Above the prospective fault at the child bus, both trip together.
    const selectivityLimitA = round(CURVE_TRIP_MULTIPLE_LOWER[feederResult.breaker.curve] * upstreamIn, 0);
    const childFaultA =
      childResult.faultLevelKa !== undefined ? round(childResult.faultLevelKa * 1000, 0) : undefined;
    const scSelective = childFaultA === undefined ? true : childFaultA <= selectivityLimitA + 1e-9;

    out.push({
      upstreamPanelId: parentId,
      upstreamCircuitId: feeder.id,
      upstreamName: feeder.name,
      upstreamRatingA: upstreamIn,
      downstreamPanelId: childId,
      downstreamName: childResult.name,
      downstreamRatingA: downstreamIn,
      ratio,
      selective,
      selectivityLimitA,
      downstreamFaultA: childFaultA,
      scSelective,
      marginNote,
    });
  }

  return out;
}
