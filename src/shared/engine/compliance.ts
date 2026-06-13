/**
 * Per-panel compliance summary — the short checklist an engineer signs off on
 * before issuing a board: voltage drop, automatic disconnection (Zs/ADS),
 * breaking capacity (Icu ≥ Isc), busbar short-circuit withstand, protective
 * conductor adiabatic withstand, and ampacity (no overloaded cable).
 *
 * Pure read over an already-computed {@link PanelResult} — it constructs no new
 * sizing, only rolls up the pass/fail facts the engine already set so the UI
 * (and the PDF) can present a single, glanceable status per topic. A topic whose
 * underlying data was not computed (e.g. Zs on a non-TN system) reports `'na'`.
 */

import type { PanelResult } from '../types/results';

/** A single compliance topic's rolled-up status. */
export type ComplianceStatus = 'pass' | 'fail' | 'na';

/** One row of the per-panel compliance checklist. */
export interface ComplianceItem {
  /** Stable key for i18n + ordering (`voltageDrop`, `ads`, `breakingCapacity`, …). */
  key: string;
  status: ComplianceStatus;
  /** Number of offending circuits (0 when passing / not applicable). */
  failCount: number;
  /** Number of circuits the topic applies to. */
  total: number;
  /** Short English fallback detail (the UI may localise from `key`). */
  detail: string;
}

/** Count circuits matching a predicate; `applies` decides the topic's denominator. */
function tally(
  panel: PanelResult,
  applies: (c: PanelResult['circuits'][number]) => boolean,
  fails: (c: PanelResult['circuits'][number]) => boolean,
): { total: number; fail: number } {
  let total = 0;
  let fail = 0;
  for (const c of panel.circuits) {
    if (!applies(c)) continue;
    total += 1;
    if (fails(c)) fail += 1;
  }
  return { total, fail };
}

/** Build a checklist item, reporting `'na'` when the topic doesn't apply here. */
function item(key: string, total: number, fail: number, detailPass: string, detailFail: string): ComplianceItem {
  if (total === 0) return { key, status: 'na', failCount: 0, total: 0, detail: 'not applicable' };
  return {
    key,
    status: fail > 0 ? 'fail' : 'pass',
    failCount: fail,
    total,
    detail: fail > 0 ? detailFail.replace('{n}', String(fail)) : detailPass,
  };
}

/**
 * The compliance checklist for one computed panel. Topics with no underlying
 * data are still returned (status `'na'`) so the UI shows a stable list.
 */
export function panelCompliance(panel: PanelResult): ComplianceItem[] {
  const items: ComplianceItem[] = [];

  // Voltage drop — segment limit and the cumulative origin-to-load limit.
  {
    const { total, fail } = tally(
      panel,
      (c) => c.loadKind !== 'spare',
      (c) =>
        c.voltageDrop.withinLimit === false ||
        (c.cumulativeDropPercent !== undefined && c.cumulativeDropPercent > c.voltageDrop.limitPercent),
    );
    items.push(item('voltageDrop', total, fail, 'all within limit', '{n} over the limit'));
  }

  // Automatic disconnection (Zs ≤ Zs_max) — TN circuits only.
  {
    const { total, fail } = tally(
      panel,
      (c) => c.disconnectsInTime !== undefined,
      (c) => c.disconnectsInTime === false,
    );
    items.push(item('ads', total, fail, 'disconnect in time', '{n} exceed Zs_max'));
  }

  // Breaking capacity (Icu ≥ prospective Isc) — incomer + branches.
  {
    let total = 0;
    let fail = 0;
    if (panel.incomer.kaAdequate !== undefined) {
      total += 1;
      if (panel.incomer.kaAdequate === false) fail += 1;
    }
    const branch = tally(panel, (c) => c.kaAdequate !== undefined, (c) => c.kaAdequate === false);
    total += branch.total;
    fail += branch.fail;
    items.push(item('breakingCapacity', total, fail, 'devices cover the fault', '{n} under-rated for Isc'));
  }

  // Busbar short-circuit withstand (Icw ≥ Isc).
  {
    const w = panel.busbar.withstand;
    items.push(
      w === undefined
        ? { key: 'busbarWithstand', status: 'na', failCount: 0, total: 0, detail: 'not applicable' }
        : item('busbarWithstand', 1, w.adequate ? 0 : 1, 'busbar withstands the fault', 'busbar under-rated'),
    );
  }

  // Protective conductor adiabatic thermal withstand.
  {
    const { total, fail } = tally(
      panel,
      (c) => c.peAdiabaticOk !== undefined,
      (c) => c.peAdiabaticOk === false,
    );
    items.push(item('protectiveConductor', total, fail, 'PE withstands the fault', '{n} PE under-sized'));
  }

  // Ampacity & cable protection (IEC 60364-4-43): the cable is not overloaded
  // (Ib ≤ Iz) AND the breaker protects it (In ≤ Iz, so the conventional trip
  // I₂ = 1.45·In ≤ 1.45·Iz). The second part bites when a manual cable override
  // pins a section too small for the breaker.
  {
    const { total, fail } = tally(
      panel,
      (c) => c.loadKind !== 'spare' && c.cable.deratedIzA > 0,
      (c) =>
        c.designCurrentA > c.cable.deratedIzA + 1e-6 ||
        c.breaker.ratingA > c.cable.deratedIzA + 1e-6,
    );
    items.push(item('ampacity', total, fail, 'cable protected & not overloaded', '{n} under-protected / overloaded'));
  }

  return items;
}

/** Overall panel status: fail if any topic fails, else pass (na topics ignored). */
export function complianceStatus(items: ComplianceItem[]): ComplianceStatus {
  if (items.some((i) => i.status === 'fail')) return 'fail';
  if (items.some((i) => i.status === 'pass')) return 'pass';
  return 'na';
}
