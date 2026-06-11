/**
 * Pure CSV serialisers for the computed system: a project-wide cable schedule and
 * a single-panel circuit table. They read only fields that already exist on the
 * engine's {@link SystemResult}/{@link CircuitResult}, never recompute, and are
 * tolerant of optional fields (rendering `''` when a value is absent).
 *
 * Pure TypeScript — no Node/DOM, no third-party libraries. Output goes through
 * {@link toCsv}, so cells are properly quoted/escaped and rows are CRLF-terminated.
 */

import type { CircuitResult, PanelResult, SystemResult } from '../types/results';
import { toCsv } from './csv';

/** Column headers for the cable schedule, in output order. */
const CABLE_SCHEDULE_HEADER: readonly string[] = [
  'Panel',
  'Tag',
  'Circuit',
  'Design A',
  'Phase',
  'Breaker A',
  'Cable mm²',
  'Cores',
  'Cable spec',
  'Vd %',
  'Cumulative Vd %',
];

/** Build one cable-schedule row for a circuit within a panel. */
function cableRow(panel: PanelResult, c: CircuitResult): (string | number)[] {
  // A spare way is breaker provision only — no cable run to schedule.
  const isSpare = c.loadKind === 'spare';
  return [
    panel.name ?? '',
    panel.tag ?? '',
    c.name ?? '',
    c.designCurrentA ?? '',
    c.phase ?? '',
    c.breaker?.ratingA ?? '',
    isSpare ? '' : (c.cable?.csaMm2 ?? ''),
    isSpare ? '' : (c.grounding?.cores ?? ''),
    isSpare ? 'SPARE' : (c.grounding?.cableSpec ?? ''),
    isSpare ? '' : (c.voltageDrop?.dropPercent ?? ''),
    isSpare ? '' : (c.cumulativeDropPercent ?? ''),
  ];
}

/**
 * Serialise the whole computed system into a project-wide cable schedule CSV.
 *
 * Panels are emitted in the system's root-first `order`; each panel contributes
 * one row per circuit. The result always begins with the header row, so the
 * output has `1 + Σ circuits` rows.
 *
 * @param system The computed {@link SystemResult}.
 * @returns A CSV document (header + one row per circuit).
 */
export function cableScheduleCsv(system: SystemResult): string {
  const rows: (string | number)[][] = [[...CABLE_SCHEDULE_HEADER]];

  const order = system.order.length > 0 ? system.order : Object.keys(system.panels);
  for (const panelId of order) {
    const panel = system.panels[panelId];
    if (!panel) continue;
    for (const c of panel.circuits) {
      rows.push(cableRow(panel, c));
    }
  }

  return toCsv(rows);
}

/**
 * Serialise a single panel's circuit table into CSV.
 *
 * Uses the same columns as {@link cableScheduleCsv}. When the panel id is not
 * found, only the header row is returned (so callers always get a valid CSV).
 *
 * @param system  The computed {@link SystemResult}.
 * @param panelId Id of the panel to export.
 * @returns A CSV document (header + one row per circuit in the panel).
 */
export function panelScheduleCsv(system: SystemResult, panelId: string): string {
  const rows: (string | number)[][] = [[...CABLE_SCHEDULE_HEADER]];

  const panel = system.panels[panelId];
  if (panel) {
    for (const c of panel.circuits) {
      rows.push(cableRow(panel, c));
    }
  }

  return toCsv(rows);
}
