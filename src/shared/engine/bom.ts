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

import type { BomLine, CostResult, PanelResult, SystemResult } from '../types/results';
import type { Part } from '../types/parts';
import { costBom, consolidateBom } from './costing';

/** Read an optional string `sku` order code from a matched catalog part. */
function skuOf(parts: Part[], partId: string | undefined): string | undefined {
  if (!partId) return undefined;
  const part = parts.find((p) => p.id === partId);
  const sku = part?.attributes.sku;
  return typeof sku === 'string' && sku.length > 0 ? sku : undefined;
}

/** Pick the cheapest catalog breaker whose rating covers `ratingA`. */
function matchBreakerPart(ratingA: number, parts: Part[]): string | undefined {
  const candidates = parts
    .filter((p) => p.category === 'breaker' && typeof p.attributes.ratingA === 'number')
    .map((p) => ({ id: p.id, ratingA: p.attributes.ratingA as number }))
    .filter((p) => p.ratingA >= ratingA)
    .sort((a, b) => a.ratingA - b.ratingA);
  return candidates[0]?.id;
}

/** Pick a catalog cable whose copper section is >= the sized section. */
function matchCablePart(csaMm2: number, parts: Part[]): string | undefined {
  const candidates = parts
    .filter((p) => p.category === 'cable' && typeof p.attributes.csaMm2 === 'number')
    .map((p) => ({ id: p.id, csaMm2: p.attributes.csaMm2 as number }))
    .filter((p) => p.csaMm2 >= csaMm2)
    .sort((a, b) => a.csaMm2 - b.csaMm2);
  return candidates[0]?.id;
}

/** Build the list of BOM lines for a single panel. */
export function buildPanelBom(panel: PanelResult, parts: Part[]): BomLine[] {
  const lines: BomLine[] = [];

  for (const circuit of panel.circuits) {
    // Branch breaker.
    const breakerPartId = matchBreakerPart(circuit.breaker.ratingA, parts);
    lines.push({
      partId: breakerPartId,
      sku: skuOf(parts, breakerPartId),
      description: `${circuit.breaker.deviceClass} ${circuit.breaker.ratingA}A curve ${circuit.breaker.curve} — ${circuit.name}`,
      category: 'breaker',
      qty: 1,
      matched: breakerPartId !== undefined,
    });

    // Cable run (priced per metre — qty 1 here as the run length is not modelled
    // as a separate quantity in the result; kept as one line for the summary).
    const cablePartId = matchCablePart(circuit.cable.csaMm2, parts);
    lines.push({
      partId: cablePartId,
      sku: skuOf(parts, cablePartId),
      description: `Cable ${circuit.cable.csaMm2} mm² — ${circuit.name}`,
      category: 'cable',
      qty: 1,
      matched: cablePartId !== undefined,
    });

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
  }

  return lines;
}

/** Flatten an entire system into BOM lines (every panel, root-first). */
export function buildSystemBom(system: SystemResult, parts: Part[]): BomLine[] {
  return system.order.flatMap((panelId) => {
    const panel = system.panels[panelId];
    return panel ? buildPanelBom(panel, parts) : [];
  });
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
