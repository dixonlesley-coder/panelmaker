/**
 * PDF report generation using server-side pdfmake (`PdfPrinter`) with the
 * bundled Roboto fonts (fully offline — see `pdfFonts.ts`).
 *
 * Two reports are produced:
 *   - `exportPanelPdf`  — a single panel: circuit schedule, busbar + enclosure
 *     spec, and a per-panel BOM.
 *   - `exportSystemPdf` — the whole project: cover, panel summary, then a panel
 *     schedule section per panel and a consolidated BOM.
 *
 * Both return the generated `Buffer`; the file-writing wrappers persist it.
 */

import { writeFile } from 'node:fs/promises';
import PdfPrinter from 'pdfmake';
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import type { ProjectInput } from '@shared/types/project';
import type {
  BomLine,
  PanelResult,
  SystemResult,
  Warning,
} from '@shared/types/results';
import type { ExportResult } from '@shared/ipc-contract';
import { robotoFonts } from './pdfFonts';
import { computeProject, computePanelResult } from './calc.service';

const printer = new PdfPrinter(robotoFonts());

const DEFAULT_STYLE = { font: 'Roboto', fontSize: 9 } as const;

/** Render a pdfmake document definition into a Buffer. */
function renderToBuffer(doc: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (c: Buffer) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* ------------------------------ doc fragments ----------------------------- */

function fmtA(a: number): string {
  return `${a.toFixed(1)} A`;
}

/** Section heading. */
function heading(text: string): Content {
  return { text, style: 'h2', margin: [0, 12, 0, 6] };
}

/** Build the circuit-schedule table for one panel. */
function circuitScheduleTable(panel: PanelResult): Content {
  const header: TableCell[] = [
    'Circuit',
    'Ib (A)',
    'Breaker',
    'Cable (mm²)',
    'Vd %',
    'OK',
  ].map((t) => ({ text: t, bold: true }));

  const body: TableCell[][] = [header];
  for (const c of panel.circuits) {
    body.push([
      c.name,
      fmtA(c.designCurrentA),
      `${c.breaker.ratingA} A ${c.breaker.deviceClass} ${c.breaker.curve}`,
      `${c.cable.csaMm2}`,
      c.voltageDrop.dropPercent.toFixed(2),
      c.voltageDrop.withinLimit ? 'yes' : 'NO',
    ]);
  }

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body,
    },
    layout: 'lightHorizontalLines',
  };
}

/** Busbar + enclosure specification block. */
function panelSpecTable(panel: PanelResult): Content {
  const b = panel.busbar;
  const e = panel.enclosure;
  const rows: TableCell[][] = [
    [{ text: 'Specification', bold: true }, { text: 'Value', bold: true }],
    ['Connected load', `${panel.totalConnectedLoadW} W`],
    ['Total demand current', fmtA(panel.totalDemandCurrentA)],
    ['Busbar', `${b.widthMm}×${b.thicknessMm} mm Cu (${b.ampacityA} A)`],
    [
      'Enclosure (W×H×D)',
      `${e.widthMm} × ${e.heightMm} × ${e.depthMm} mm (${e.sheetThicknessMm} mm)`,
    ],
    ['Heat dissipation', `${e.totalHeatW} W (${e.ventilation})`],
    ['Modules / rows', `${e.modules} / ${e.rows}`],
  ];
  return {
    table: { widths: ['auto', '*'], body: rows },
    layout: 'lightHorizontalLines',
  };
}

/** Render a warnings list (if any). */
function warningsBlock(warnings: Warning[]): Content[] {
  if (warnings.length === 0) return [];
  return [
    heading('Warnings'),
    {
      ul: warnings.map(
        (w) => `[${w.severity.toUpperCase()}] ${w.code}: ${w.message}`,
      ),
      fontSize: 8,
    },
  ];
}

/**
 * Derive a flat bill of materials from a panel result. The engine does not emit
 * a BOM directly, so we aggregate the obvious line items: one breaker and one
 * cable run per circuit, plus any control-gear devices.
 */
function bomLinesForPanel(panel: PanelResult): BomLine[] {
  const lines: BomLine[] = [];
  for (const c of panel.circuits) {
    lines.push({
      description: `Breaker ${c.breaker.ratingA} A ${c.breaker.deviceClass} ${c.breaker.curve} — ${c.name}`,
      category: 'breaker',
      qty: 1,
      matched: false,
    });
    lines.push({
      description: `Cable ${c.cable.csaMm2} mm² — ${c.name}`,
      category: 'cable',
      qty: 1,
      matched: false,
    });
    if (c.control) {
      for (const d of c.control.devices) {
        lines.push({
          description: `${d.category} (${d.role})${d.rating ? ` — ${d.rating}` : ''}`,
          category: d.category,
          qty: d.qty,
          matched: false,
        });
      }
    }
  }
  return lines;
}

/** Render a BOM table from BOM lines. */
function bomTable(lines: BomLine[]): Content {
  const header: TableCell[] = ['Item', 'Category', 'Qty'].map((t) => ({
    text: t,
    bold: true,
  }));
  const body: TableCell[][] = [header];
  for (const l of lines) {
    body.push([l.description, l.category, String(l.qty)]);
  }
  return {
    table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
  };
}

/* ------------------------------- documents -------------------------------- */

const STYLES = {
  title: { fontSize: 20, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
  subtitle: { fontSize: 11, color: '#555' },
  h1: { fontSize: 15, bold: true },
  h2: { fontSize: 12, bold: true },
} as const;

/** Cover block shared by both reports. */
function coverBlock(project: ProjectInput, reportTitle: string): Content[] {
  return [
    { text: 'PanelMaker', style: 'subtitle' },
    { text: reportTitle, style: 'title' },
    { text: project.name, style: 'h1', margin: [0, 4, 0, 0] },
    {
      text: `Generated ${new Date().toISOString().slice(0, 10)} · ${project.panels.length} panel(s)`,
      style: 'subtitle',
      margin: [0, 2, 0, 8],
    },
  ];
}

/** Build the document definition for a single panel report. */
function panelDocDefinition(
  panel: PanelResult,
  project: ProjectInput,
): TDocumentDefinitions {
  return {
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    pageMargins: [36, 36, 36, 48],
    content: [
      ...coverBlock(project, 'Panel Report'),
      heading(`Panel: ${panel.name}`),
      panelSpecTable(panel),
      heading('Circuit Schedule'),
      circuitScheduleTable(panel),
      heading('Bill of Materials'),
      bomTable(bomLinesForPanel(panel)),
      ...warningsBlock(panel.warnings),
      {
        text: `Standards: ${panel.standardsVersion}`,
        style: 'subtitle',
        margin: [0, 12, 0, 0],
      },
    ],
  };
}

/** Build the document definition for the whole-system report. */
function systemDocDefinition(
  system: SystemResult,
  project: ProjectInput,
): TDocumentDefinitions {
  const content: Content[] = [...coverBlock(project, 'System Report')];

  // System summary.
  content.push(heading('System Summary'));
  content.push({
    table: {
      widths: ['auto', '*'],
      body: [
        [{ text: 'Metric', bold: true }, { text: 'Value', bold: true }],
        ['Panels', String(system.totals.panelCount)],
        ['Total connected load', `${system.totals.connectedLoadW} W`],
      ],
    },
    layout: 'lightHorizontalLines',
  });

  // Per-panel sections in root-first order.
  const allBom: BomLine[] = [];
  for (const panelId of system.order) {
    const panel = system.panels[panelId];
    if (!panel) continue;
    content.push(heading(`Panel: ${panel.name}`));
    content.push(panelSpecTable(panel));
    content.push({ text: 'Circuit Schedule', style: 'h2', margin: [0, 6, 0, 4] });
    content.push(circuitScheduleTable(panel));
    allBom.push(...bomLinesForPanel(panel));
  }

  // Consolidated BOM + system warnings.
  content.push(heading('Consolidated Bill of Materials'));
  content.push(bomTable(allBom));
  content.push(...warningsBlock(system.warnings));

  return {
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    pageMargins: [36, 36, 36, 48],
    content,
  };
}

/* --------------------------------- API ------------------------------------ */

/** Generate a single-panel PDF as a Buffer. */
export function exportPanelPdfBuffer(
  panel: PanelResult,
  project: ProjectInput,
): Promise<Buffer> {
  return renderToBuffer(panelDocDefinition(panel, project));
}

/** Generate the whole-system PDF as a Buffer. */
export function exportSystemPdfBuffer(
  system: SystemResult,
  project: ProjectInput,
): Promise<Buffer> {
  return renderToBuffer(systemDocDefinition(system, project));
}

/**
 * Compute + render a single panel report and write it to `filePath`.
 * Recomputes from the project so the document is always self-consistent.
 */
export async function exportPanelPdf(
  project: ProjectInput,
  panelId: string,
  filePath: string,
): Promise<ExportResult> {
  const panel = computePanelResult(project, panelId);
  if (!panel) {
    throw new Error(`Panel "${panelId}" not found in project "${project.id}"`);
  }
  const buffer = await exportPanelPdfBuffer(panel, project);
  await writeFile(filePath, buffer);
  return { filePath, byteLength: buffer.byteLength };
}

/** Compute + render the whole-system report and write it to `filePath`. */
export async function exportSystemPdf(
  project: ProjectInput,
  filePath: string,
): Promise<ExportResult> {
  const system = computeProject(project);
  const buffer = await exportSystemPdfBuffer(system, project);
  await writeFile(filePath, buffer);
  return { filePath, byteLength: buffer.byteLength };
}
