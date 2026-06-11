/**
 * One-click "export all deliverables": assemble every shareable artifact of the
 * project as named in-memory files — the consolidated BOM workbook, the
 * project-wide cable schedule CSV, and a single-line + GA front-view DXF per
 * panel. The system PDF is NOT built here: it renders in the main process
 * (desktop only) and `exportAllDeliverables` writes it alongside these.
 *
 * Pure data-in/data-out (no DOM, no store) so the manifest is unit-testable.
 */

import * as XLSX from 'xlsx';
import type { CostResult, SystemResult } from '@shared/types/results';
import type { ProjectInput } from '@shared/types/project';
import { cableScheduleCsv } from '@shared/io/scheduleExport';
import { panelGaDxf, panelSldDxf } from '@shared/drawing';
import { panelLabel } from '@shared/labels';
import { bomToAoa } from './bomExport';

/** One named export artifact: text (CSV/DXF) as a string, binary (XLSX) as bytes. */
export interface Deliverable {
  filename: string;
  mime: string;
  data: string | Uint8Array;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DXF_MIME = 'image/vnd.dxf';

/** Sanitise a filename stem (project/panel name) for the filesystem. */
export function safeStem(stem: string): string {
  const trimmed = stem.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed.length > 0 ? trimmed : 'project';
}

/**
 * Build the full deliverables manifest for a computed system: one BOM `.xlsx`,
 * one cable-schedule `.csv`, and an SLD + GA `.dxf` per panel (root-first).
 */
export function buildDeliverables(
  project: ProjectInput,
  system: SystemResult,
  bom: CostResult,
): Deliverable[] {
  const stem = safeStem(project.name);
  const files: Deliverable[] = [];

  // Consolidated project BOM workbook — same sheet the BOM drawer exports.
  const ws = XLSX.utils.aoa_to_sheet(bomToAoa(bom.lines, bom.currency));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM');
  const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  files.push({ filename: `${stem} - BOM.xlsx`, mime: XLSX_MIME, data: new Uint8Array(xlsx) });

  // Project-wide cable schedule — UTF-8 BOM so Excel decodes mm² correctly.
  files.push({
    filename: `${stem} - cable schedule.csv`,
    mime: 'text/csv;charset=utf-8',
    data: '﻿' + cableScheduleCsv(system),
  });

  // Per-panel drawings: the single-line and the to-scale GA front view.
  for (const panelId of system.order) {
    const result = system.panels[panelId];
    const input = project.panels.find((p) => p.id === panelId);
    if (!result || !input) continue;
    const pStem = safeStem(panelLabel(input));
    files.push({ filename: `${pStem} - SLD.dxf`, mime: DXF_MIME, data: panelSldDxf(input, result) });
    files.push({ filename: `${pStem} - GA.dxf`, mime: DXF_MIME, data: panelGaDxf(input, result) });
  }

  return files;
}
