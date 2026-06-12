/**
 * Bill-of-materials derivation (pure).
 *
 * The sizing engine sizes gear but does not emit a bill of materials, so this
 * module derives one from a computed panel/system: one line per branch breaker,
 * its cable run, and every sized control-gear device. Lines are matched to
 * catalog part ids by the device's own `chosenPartId` (control gear) or by a
 * small rating heuristic (breakers/cables), then priced with `costBom`.
 *
 * Lives in the shared engine (no Node/DOM deps) so both the renderer (live
 * costing) and the main process (PDF quotation/BOM export) build the same BOM.
 */

import type { BomLine, CircuitResult, CostResult, PanelResult, SystemResult } from '../types/results';
import type { Part } from '../types/parts';
import { costBom, consolidateBom } from './costing';

/** Read an optional string `sku` order code from a matched catalog part. */
function skuOf(parts: Part[], partId: string | undefined): string | undefined {
  if (!partId) return undefined;
  const part = parts.find((p) => p.id === partId);
  const sku = part?.attributes.sku;
  return typeof sku === 'string' && sku.length > 0 ? sku : undefined;
}

/** What the engine sized — used to pick the closest-matching catalog breaker. */
interface BreakerNeed {
  ratingA: number;
  curve?: string;
  deviceClass?: string;
  /** Desired pole count (3 for a three-phase circuit, 1 otherwise). */
  poles?: number;
}

/**
 * Pick the catalog breaker that best fits the sized device: the smallest standard
 * rating that covers `ratingA`, but preferring the right device class (MCB/MCCB),
 * pole count and trip curve. A coarse rating-only match would grab a 1P part for a
 * 3P breaker now that the catalog carries the full 1P–4P × B/C/D matrix — so a
 * mismatch on class/poles/curve outweighs a smaller rating. A part that simply
 * doesn't declare an attribute is treated as compatible (no penalty).
 */
function matchBreakerPart(need: BreakerNeed, parts: Part[]): string | undefined {
  const candidates = parts
    .filter((p) => p.category === 'breaker' && typeof p.attributes.ratingA === 'number')
    .map((p) => ({
      id: p.id,
      ratingA: p.attributes.ratingA as number,
      poles: typeof p.attributes.poles === 'number' ? (p.attributes.poles as number) : undefined,
      curve: typeof p.attributes.curve === 'string' ? (p.attributes.curve as string) : undefined,
      deviceClass:
        typeof p.attributes.deviceClass === 'string' ? (p.attributes.deviceClass as string) : undefined,
    }))
    .filter((p) => p.ratingA >= need.ratingA);

  const penalty = (c: (typeof candidates)[number]): number => {
    let s = 0;
    if (need.deviceClass && c.deviceClass && c.deviceClass !== need.deviceClass) s += 1000;
    if (need.poles !== undefined && c.poles !== undefined && c.poles !== need.poles) s += 100;
    if (need.curve && c.curve && c.curve !== need.curve) s += 10;
    return s;
  };

  candidates.sort(
    (a, b) => penalty(a) - penalty(b) || a.ratingA - b.ratingA || (a.poles ?? 9) - (b.poles ?? 9),
  );
  return candidates[0]?.id;
}

/**
 * Pick a catalog cable whose section is >= the sized section, preferring parts
 * of the circuit's effective construction (`attributes.type`, e.g. NYM vs NYY).
 * When the catalog has no part of that type, fall back to section-only matching
 * so brands that only stock one construction still price the run.
 */
function matchCablePart(csaMm2: number, parts: Part[], cableType?: string): string | undefined {
  const candidates = parts
    .filter((p) => p.category === 'cable' && typeof p.attributes.csaMm2 === 'number')
    .map((p) => ({
      id: p.id,
      csaMm2: p.attributes.csaMm2 as number,
      type: typeof p.attributes.type === 'string' ? (p.attributes.type as string) : undefined,
    }))
    .filter((p) => p.csaMm2 >= csaMm2);
  const sameType = cableType ? candidates.filter((p) => p.type === cableType) : [];
  const pool = sameType.length > 0 ? sameType : candidates;
  pool.sort((a, b) => a.csaMm2 - b.csaMm2);
  return pool[0]?.id;
}

/** Pick the first catalog part of a category (point-level accessories). */
function matchFirstOfCategory(category: Part['category'], parts: Part[]): string | undefined {
  return parts.find((p) => p.category === category)?.id;
}

/**
 * Cable constructions that are SEPARATE single-core conductors pulled into a
 * containment (vs a finished multicore cable with its integral G/Y PE core).
 * Their BOM lines are per-conductor, with the PE as its own green-yellow wire.
 */
const SINGLE_CORE_TYPES: ReadonlySet<string> = new Set(['NYA', 'NYAF']);

/**
 * Matched catalog order codes (SKUs) for a circuit's breaker and cable, using the
 * SAME matchers the BOM uses — so what's surfaced inline on a component is exactly
 * what lands in the bill of materials. Absent when no catalog part matches.
 */
export function circuitOrderCodes(
  circuit: CircuitResult,
  parts: Part[],
): { breaker?: string; cable?: string } {
  const breakerId = matchBreakerPart(
    {
      ratingA: circuit.breaker.ratingA,
      curve: circuit.breaker.curve,
      deviceClass: circuit.breaker.deviceClass,
      poles: circuit.phase === '3ph' ? 3 : 1,
    },
    parts,
  );
  const out: { breaker?: string; cable?: string } = {};
  const breaker = skuOf(parts, breakerId);
  if (breaker) out.breaker = breaker;
  // A spare way has no cable run, so there is no cable order code to surface.
  if (circuit.loadKind !== 'spare') {
    const cableId = matchCablePart(circuit.cable.csaMm2, parts, circuit.grounding.cableType);
    const cable = skuOf(parts, cableId);
    if (cable) out.cable = cable;
  }
  return out;
}

/** Build the list of BOM lines for a single panel. */
export function buildPanelBom(panel: PanelResult, parts: Part[]): BomLine[] {
  const lines: BomLine[] = [];

  // Tenant/check kWh sub-meter (+ its CTs when CT-operated).
  if (panel.submeter) {
    const meterId = matchFirstOfCategory('panel_meter', parts);
    lines.push({
      partId: meterId,
      sku: skuOf(parts, meterId),
      description: `kWh sub-meter (${panel.submeter.metering === 'ct' ? `CT ${panel.submeter.ctRatio}` : 'direct'}) — ${panel.name}`,
      category: 'panel_meter',
      qty: 1,
      matched: meterId !== undefined,
    });
    if (panel.submeter.metering === 'ct') {
      const ctId = matchFirstOfCategory('current_transformer', parts);
      lines.push({
        partId: ctId,
        sku: skuOf(parts, ctId),
        description: `Current transformer ${panel.submeter.ctRatio} — ${panel.name}`,
        category: 'current_transformer',
        qty: 3,
        matched: ctId !== undefined,
      });
    }
  }

  for (const circuit of panel.circuits) {
    // Branch breaker — match class/poles/curve, not just rating.
    const breakerPartId = matchBreakerPart(
      {
        ratingA: circuit.breaker.ratingA,
        curve: circuit.breaker.curve,
        deviceClass: circuit.breaker.deviceClass,
        poles: circuit.phase === '3ph' ? 3 : 1,
      },
      parts,
    );
    lines.push({
      partId: breakerPartId,
      sku: skuOf(parts, breakerPartId),
      description: `${circuit.breaker.deviceClass} ${circuit.breaker.ratingA}A curve ${circuit.breaker.curve} — ${circuit.name}`,
      category: 'breaker',
      qty: 1,
      matched: breakerPartId !== undefined,
    });

    // Cable run (priced per metre — qty is the CONDUCTOR count for single-core
    // wiring, 1 for a multicore cable; run length is not modelled as a separate
    // quantity). Spare ways are breaker provision only: no cable for them.
    if (circuit.loadKind !== 'spare') {
      const type = circuit.grounding.cableType;
      const runs = circuit.cable.runsPerPhase ?? 1;
      if (SINGLE_CORE_TYPES.has(type)) {
        // NYA/NYAF conduit wiring is SEPARATE single-core conductors: the
        // lives + neutral at the phase size, and the protective earth as its
        // own green-yellow conductor at the (usually reduced) PE size.
        const livesAndN = (circuit.grounding.cores - 1) * runs;
        const phaseId = matchCablePart(circuit.cable.csaMm2, parts, type);
        lines.push({
          partId: phaseId,
          sku: skuOf(parts, phaseId),
          description: `Wire ${type} ${circuit.cable.csaMm2} mm² (L/N) — ${circuit.name}`,
          category: 'cable',
          qty: livesAndN,
          matched: phaseId !== undefined,
        });
        const peId = matchCablePart(circuit.grounding.peCsaMm2, parts, type);
        lines.push({
          partId: peId,
          sku: skuOf(parts, peId),
          description: `Wire ${type} ${circuit.grounding.peCsaMm2} mm² G/Y (PE) — ${circuit.name}`,
          category: 'cable',
          qty: runs,
          matched: peId !== undefined,
        });
      } else {
        // Multicore cable (NYY/NYM/N2XY/FRC…): the PE is the integral
        // green-yellow core inside the cable — one product, one line.
        const cablePartId = matchCablePart(circuit.cable.csaMm2, parts, type);
        lines.push({
          partId: cablePartId,
          sku: skuOf(parts, cablePartId),
          description: `Cable ${type} ${circuit.grounding.cableSpec.replace(`${type} `, '')} — ${circuit.name}`,
          category: 'cable',
          qty: 1,
          matched: cablePartId !== undefined,
        });
      }
    }

    // Control gear, if any.
    if (circuit.control) {
      for (const device of circuit.control.devices) {
        lines.push({
          partId: device.chosenPartId,
          sku: skuOf(parts, device.chosenPartId),
          description: `${device.role}${device.rating ? ` (${device.rating})` : ''} — ${circuit.name}`,
          category: device.category,
          qty: device.qty,
          matched: device.chosenPartId !== undefined,
        });
      }
    }

    // Point-level detail: fixtures, switching points and socket outlets.
    const fc = circuit.finalCircuit;
    if (fc) {
      for (const row of fc.rows) {
        if (row.qty <= 0) continue;
        const isFixture = row.wattsPerFitting !== undefined;
        const category = isFixture ? 'light_fixture' : 'socket_outlet';
        const partId = matchFirstOfCategory(category, parts);
        lines.push({
          partId,
          sku: skuOf(parts, partId),
          description: isFixture
            ? `${row.name} (${row.wattsPerFitting} W) — ${circuit.name}`
            : `Socket outlet: ${row.name} — ${circuit.name}`,
          category,
          qty: row.qty,
          matched: partId !== undefined,
        });
      }
      for (const g of fc.switchGroups) {
        const category = g.kind === 'smart' ? 'smart_switch' : 'switch';
        const partId = matchFirstOfCategory(category, parts);
        lines.push({
          partId,
          sku: skuOf(parts, partId),
          description: `${g.detail} switch "${g.label}" — ${circuit.name}`,
          category,
          qty: 1,
          matched: partId !== undefined,
        });
      }
    }
  }

  return lines;
}

/** Flatten an entire system into BOM lines (every panel, root-first). */
export function buildSystemBom(system: SystemResult, parts: Part[]): BomLine[] {
  const lines = system.order.flatMap((panelId) => {
    const panel = system.panels[panelId];
    return panel ? buildPanelBom(panel, parts) : [];
  });

  // Earthing system: the main earthing + bonding conductors are BARE COPPER
  // (BC) runs — circuit PEs live inside their cables / as G/Y wires, but the
  // electrode tail and equipotential bonding are the BC the installer buys.
  const earthing = system.earthing;
  if (earthing) {
    const mainId = matchCablePart(earthing.mainEarthingConductorMm2, parts, 'BC');
    lines.push({
      partId: mainId,
      sku: skuOf(parts, mainId),
      description: `Main earthing conductor — BC ${earthing.mainEarthingConductorMm2} mm² (to electrode)`,
      category: 'cable',
      qty: 1,
      matched: mainId !== undefined,
    });
    const bondId = matchCablePart(earthing.mainBondingConductorMm2, parts, 'BC');
    lines.push({
      partId: bondId,
      sku: skuOf(parts, bondId),
      description: `Main equipotential bonding — BC ${earthing.mainBondingConductorMm2} mm²`,
      category: 'cable',
      qty: 1,
      matched: bondId !== undefined,
    });
    if (earthing.electrode) {
      const e = earthing.electrode;
      lines.push({
        description: `Earth electrode rod ${e.rodLengthM} m × Ø${e.rodDiameterMm} mm (array → ${e.achievedOhm} Ω)`,
        category: 'accessory',
        qty: e.rodCount,
        matched: false,
      });
    }
  }
  return lines;
}

/** Cost a single panel by deriving and pricing its BOM. */
export function costPanel(panel: PanelResult, parts: Part[], prices: Map<string, number>): CostResult {
  return costBom(buildPanelBom(panel, parts), prices);
}

/** Cost an entire system across all panels. */
export function costSystem(
  system: SystemResult,
  parts: Part[],
  prices: Map<string, number>,
): CostResult {
  return costBom(buildSystemBom(system, parts), prices);
}

/**
 * Build the consolidated, priced project-level BOM: every panel's lines merged
 * by part/description and category, then priced. The grand total reflects the
 * whole project; identical parts used across panels collapse into one line.
 */
export function costSystemConsolidated(
  system: SystemResult,
  parts: Part[],
  prices: Map<string, number>,
): CostResult {
  return costBom(consolidateBom(buildSystemBom(system, parts)), prices);
}
