/**
 * Bill-of-materials export helpers.
 *
 * The pure builders (`bomToCsv`, `bomToAoa`) turn priced {@link BomLine}s into a
 * CSV string / a SheetJS array-of-arrays and are unit-tested with no DOM. The
 * download helpers wrap them in a Blob + anchor click so a panel/system BOM can
 * be saved as `.csv` or `.xlsx` from the renderer in both the web build and the
 * Electron renderer (no main-process IPC, no `XLSX.writeFile`/Node fs path).
 */

import * as XLSX from 'xlsx';
import type { BomLine } from '@shared/types/results';

/** Column order shared by the CSV and the worksheet. */
const HEADERS = ['Category', 'Description', 'Qty', 'Unit price', 'Line total', 'Matched'] as const;

/** Quote a single CSV field per RFC 4180 when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** One presentation row for a BOM line, in {@link HEADERS} order. */
function lineCells(line: BomLine): [string, string, number, number | '', number | '', string] {
  return [
    line.category,
    line.description,
    line.qty,
    line.matched && line.unitPrice !== undefined ? line.unitPrice : '',
    line.matched && line.lineTotal !== undefined ? line.lineTotal : '',
    line.matched ? 'yes' : 'no',
  ];
}

/** Sum the priced line totals (unmatched lines contribute nothing). */
function totalOf(lines: BomLine[]): number {
  return lines.reduce((sum, l) => sum + (l.matched && l.lineTotal !== undefined ? l.lineTotal : 0), 0);
}

/**
 * Build an RFC-4180 CSV string for a BOM: a header row, one row per line, and a
 * trailing grand-total row. The `currency` annotates the price column header.
 */
export function bomToCsv(lines: BomLine[], currency: string): string {
  const header = [
    'Category',
    'Description',
    'Qty',
    `Unit price (${currency})`,
    `Line total (${currency})`,
    'Matched',
  ];
  const rows: (string | number)[][] = [header];
  for (const line of lines) {
    rows.push(lineCells(line));
  }
  rows.push(['', 'Grand total', '', '', totalOf(lines), '']);
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n');
}

/**
 * Build a SheetJS array-of-arrays for a BOM: the same columns as the CSV plus a
 * grand-total row. Numbers stay numeric so the spreadsheet can sum/format them.
 */
export function bomToAoa(lines: BomLine[], currency: string): (string | number)[][] {
  const header: (string | number)[] = [
    'Category',
    'Description',
    'Qty',
    `Unit price (${currency})`,
    `Line total (${currency})`,
    'Matched',
  ];
  const rows: (string | number)[][] = [header];
  for (const line of lines) {
    rows.push(lineCells(line));
  }
  rows.push(['', 'Grand total', '', '', totalOf(lines), '']);
  return rows;
}

/** Trigger a browser download of `blob` as `filename` via a transient anchor. */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Export a BOM as a `.csv` file. */
export function downloadBomCsv(filename: string, lines: BomLine[], currency: string): void {
  const csv = bomToCsv(lines, currency);
  // Prepend a UTF-8 BOM so Excel opens non-ASCII (e.g. mm²) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(filename, blob);
}

/** Export a BOM as a single-sheet `.xlsx` workbook. */
export function downloadBomXlsx(filename: string, lines: BomLine[], currency: string): void {
  const ws = XLSX.utils.aoa_to_sheet(bomToAoa(lines, currency));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(filename, blob);
}
