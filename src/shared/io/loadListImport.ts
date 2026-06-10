/**
 * CSV load-list importer: turn a spreadsheet of circuits (one row per load) into
 * the engine's {@link PanelInput}/{@link CircuitInput} model so a project can be
 * bootstrapped from an external load schedule.
 *
 * Pure TypeScript — no Node/DOM, no third-party libraries. Parsing is delegated
 * to the hand-rolled {@link parseCsv}. The importer is deliberately *lenient*: it
 * never throws, fills every missing value with a sensible default that matches
 * the `CircuitInput`/`PanelInput` defaults used elsewhere, and reports anything
 * it had to assume or skip through the returned `warnings` array.
 */

import type { CircuitInput, PanelInput } from '../types/project';
import type { LoadKind, StarterType } from '../types';
import { parseCsv } from './csv';

/** The {@link LoadKind} union, materialised at runtime for validation. */
const LOAD_KINDS: readonly LoadKind[] = [
  'general',
  'lighting',
  'socket',
  'heating',
  'hvac',
  'motor',
  'pump',
  'ev_charger',
  'welding',
  'capacitor',
  'ups',
  'feeder',
];

/** The {@link StarterType} union, materialised at runtime for validation. */
const STARTER_TYPES: readonly StarterType[] = [
  'DOL',
  'STAR_DELTA',
  'REVERSING',
  'SOFT_STARTER',
  'VFD',
  'ATS',
  'PUMP',
];

/**
 * Header aliases, grouped by the logical column they map to. Matching is
 * case-insensitive and ignores surrounding whitespace plus any non-alphanumeric
 * characters (so `"Load (kW)"`, `"load_kw"` and `"loadKW"` all collapse to the
 * same key). The first matching column in the header row wins.
 */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  panel: ['panel', 'panelname', 'board', 'db', 'distributionboard'],
  name: ['circuit', 'name', 'circuitname', 'description', 'load', 'loadname'],
  loadW: ['loadw', 'watts', 'w', 'powerw', 'va'],
  kW: ['kw', 'loadkw', 'powerkw', 'kilowatts'],
  phase: ['phase', 'phases', 'ph', 'system'],
  length: ['length', 'lengthm', 'cablelength', 'runm', 'run', 'distance'],
  loadKind: ['loadkind', 'kind', 'type', 'loadtype', 'category'],
  cosPhi: ['cosphi', 'pf', 'powerfactor', 'cosphivalue', 'cos'],
  motorKw: ['motorkw', 'motorpower', 'motorrating'],
  starterType: ['startertype', 'starter', 'starting', 'startingmethod'],
};

/** Normalise a header cell to its comparison key (lowercase, alnum-only). */
function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a map from logical column name to its 0-based index in the header row,
 * resolving the aliases above. A logical column absent from the header is simply
 * omitted from the map (callers then fall back to defaults).
 */
function mapColumns(header: string[]): Map<string, number> {
  const normalised = header.map(normaliseHeader);
  const out = new Map<string, number>();
  for (const [logical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalised.indexOf(alias);
      if (idx !== -1) {
        out.set(logical, idx);
        break;
      }
    }
  }
  return out;
}

/** Read a cell by logical column, trimmed; `undefined` when the column/value is absent. */
function cell(row: string[], cols: Map<string, number>, logical: string): string | undefined {
  const idx = cols.get(logical);
  if (idx === undefined) return undefined;
  const raw = row[idx];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse a finite number from a cell, tolerating thousands separators; else `undefined`. */
function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Classify a phase cell as single- (`1ph`) or three-phase (`3ph`); `undefined` if unclear. */
function parsePhase(value: string | undefined): '1ph' | '3ph' | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (/(^|[^0-9])3/.test(v) || v.includes('three') || v.includes('tiga')) return '3ph';
  if (/(^|[^0-9])1/.test(v) || v.includes('single') || v.includes('satu')) return '1ph';
  return undefined;
}

/** Validate a `loadKind` cell against the union; `null` signals an unknown value. */
function parseLoadKind(value: string | undefined): LoadKind | null | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase().replace(/[^a-z_]/g, '');
  const match = LOAD_KINDS.find((k) => k === v);
  return match ?? null;
}

/** Validate a `starterType` cell against the union; `null` signals an unknown value. */
function parseStarterType(value: string | undefined): StarterType | null | undefined {
  if (value === undefined) return undefined;
  const v = value.toUpperCase().replace(/[^A-Z]/g, '');
  const match = STARTER_TYPES.find((s) => s.replace(/_/g, '') === v);
  return match ?? null;
}

/** The shape returned by {@link parseLoadList}. */
export interface LoadListResult {
  /** One {@link PanelInput} per distinct panel name encountered, in first-seen order. */
  panels: PanelInput[];
  /** Human-readable notes about defaulted/skipped rows; empty when the import was clean. */
  warnings: string[];
}

/**
 * Parse a CSV load list into panels and circuits.
 *
 * The first non-empty row is treated as a header and mapped to logical columns
 * (see {@link COLUMN_ALIASES}). Every subsequent row becomes one branch circuit,
 * grouped into a {@link PanelInput} by its `panel` column (rows with no panel
 * name are gathered under a single default `"Main Panel"`). Each panel is a
 * standalone utility-fed 3-phase board with neutral defaults; ids are stable and
 * generated as `panel-<n>` / `c-<n>`.
 *
 * Conversions and defaults:
 * - `kW` is converted to watts (`loadW`) when an explicit `loadW`/watts column is
 *   absent; an explicit watts column wins.
 * - `cosPhi` defaults to `0.85`, `length` to `0`, `loadKind` to `'general'`.
 * - an unknown `loadKind` falls back to `'general'` (with a warning); likewise an
 *   unknown `starterType` is dropped (with a warning).
 * - a row with no recognisable load (neither watts, kW, nor a motorKw) keeps a
 *   `0 W` load and emits a warning.
 *
 * The function is total: malformed input produces warnings, never exceptions.
 *
 * @param text Raw CSV text of the load list.
 * @returns The grouped panels plus a list of import warnings.
 */
export function parseLoadList(text: string): LoadListResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);

  if (rows.length === 0) {
    warnings.push('Empty load list — no rows found.');
    return { panels: [], warnings };
  }

  const header = rows[0] ?? [];
  const cols = mapColumns(header);
  if (cols.size === 0) {
    warnings.push('Header row has no recognised columns; expected at least a panel/circuit/load column.');
  }

  // Preserve first-seen panel order while grouping circuits.
  const panelOrder: string[] = [];
  const byPanel = new Map<string, CircuitInput[]>();
  let circuitSeq = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    // Skip fully blank rows (a single empty cell or all-empty cells).
    if (row.every((c) => c.trim().length === 0)) continue;

    const rowNo = r + 1; // 1-based, header-inclusive, for human-friendly warnings

    const panelName = cell(row, cols, 'panel') ?? 'Main Panel';
    const circuitId = `c-${++circuitSeq}`;
    const name = cell(row, cols, 'name') ?? `Circuit ${circuitSeq}`;

    // Load: explicit watts wins; otherwise kW × 1000; otherwise 0 (with a warning).
    const watts = num(cell(row, cols, 'loadW'));
    const kw = num(cell(row, cols, 'kW'));
    let loadW = 0;
    if (watts !== undefined) {
      loadW = watts;
    } else if (kw !== undefined) {
      loadW = kw * 1000;
    }

    const motorKw = num(cell(row, cols, 'motorKw'));
    if (watts === undefined && kw === undefined && motorKw === undefined) {
      warnings.push(`Row ${rowNo} ("${name}"): no load found (watts/kW/motorKw) — defaulted to 0 W.`);
    }

    const cosPhi = num(cell(row, cols, 'cosPhi')) ?? 0.85;
    const lengthM = num(cell(row, cols, 'length')) ?? 0;

    const kindParsed = parseLoadKind(cell(row, cols, 'loadKind'));
    let loadKind: LoadKind = 'general';
    if (kindParsed === null) {
      warnings.push(
        `Row ${rowNo} ("${name}"): unknown loadKind "${cell(row, cols, 'loadKind')}" — defaulted to "general".`,
      );
    } else if (kindParsed !== undefined) {
      loadKind = kindParsed;
    }

    const starterParsed = parseStarterType(cell(row, cols, 'starterType'));
    let starterType: StarterType | undefined;
    if (starterParsed === null) {
      warnings.push(
        `Row ${rowNo} ("${name}"): unknown starterType "${cell(row, cols, 'starterType')}" — ignored.`,
      );
    } else if (starterParsed !== undefined) {
      starterType = starterParsed;
    }

    // Phase is informational on import (the engine derives phase from load/system),
    // but a clearly single-phase row is worth surfacing.
    const phase = parsePhase(cell(row, cols, 'phase'));
    if (phase === '1ph') {
      warnings.push(`Row ${rowNo} ("${name}"): marked single-phase — the panel is 3-phase; verify the assignment.`);
    }

    const circuit: CircuitInput = {
      id: circuitId,
      name,
      role: 'branch',
      loadW,
      cosPhi,
      lengthM,
      loadKind,
      isLighting: loadKind === 'lighting',
      demandFactor: 1,
      ...(motorKw !== undefined ? { motorKw } : {}),
      ...(starterType !== undefined ? { starterType } : {}),
    };

    if (!byPanel.has(panelName)) {
      byPanel.set(panelName, []);
      panelOrder.push(panelName);
    }
    byPanel.get(panelName)!.push(circuit);
  }

  const panels: PanelInput[] = panelOrder.map((panelName, i) => ({
    id: `panel-${i + 1}`,
    name: panelName,
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits: byPanel.get(panelName) ?? [],
  }));

  if (panels.length === 0) {
    warnings.push('No data rows found after the header.');
  }

  return { panels, warnings };
}
