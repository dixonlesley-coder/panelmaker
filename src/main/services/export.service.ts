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
import type { PanelInput, ProjectInput, ProjectMeta } from '@shared/types/project';
import type { Part } from '@shared/types/parts';
import type {
  BomLine,
  PanelResult,
  QuotationResult,
  SystemResult,
  Warning,
} from '@shared/types/results';
import type { ExportResult } from '@shared/ipc-contract';
import { panelGaSvg, panelPointsSvg, panelSldSvg, type TitleStrip } from '@shared/drawing';
import {
  buildSystemBom,
  consolidateBom,
  costBom,
  computeQuotation,
} from '@shared/engine';
import { STANDARD_REFERENCES } from '@shared/standards';
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

/**
 * Build the drawing title-strip from the project metadata for a given sheet, so
 * the embedded SLD/GA carry a small bottom-right title block. Returns `undefined`
 * when no branding is present, leaving the diagrams unchanged.
 */
function titleStripFor(
  project: ProjectInput,
  sheet: string,
): TitleStrip | undefined {
  const meta = project.meta;
  if (!meta) return undefined;
  const strip: TitleStrip = { project: project.name, sheet };
  if (meta.companyName) strip.company = meta.companyName;
  if (meta.drawingNumber) strip.drawingNumber = meta.drawingNumber;
  if (meta.revision) strip.revision = meta.revision;
  return strip;
}

/**
 * Vector single-line + general-arrangement diagrams for a panel, embedded as SVG
 * (pdfmake renders them via svg-to-pdfkit). The SLD is fitted to the text width;
 * the GA is fitted within a box so the to-scale elevation never overflows. The GA
 * goes on its own block (`pageBreak: 'before'`) so a tall cabinet is not split.
 *
 * When the project carries branding metadata, each diagram gets a small
 * bottom-right title-strip.
 */
function panelDiagramsBlock(
  panel: PanelInput,
  result: PanelResult,
  project: ProjectInput,
): Content[] {
  const blocks: Content[] = [
    heading('Single-line diagram'),
    { svg: panelSldSvg(panel, result, titleStripFor(project, 'Single-line diagram')), width: 515 },
    { text: 'General arrangement', style: 'h2', margin: [0, 12, 0, 6], pageBreak: 'before' },
    { svg: panelGaSvg(panel, result, titleStripFor(project, 'General arrangement')), fit: [515, 360] },
  ];
  // Lighting & small-power points diagram — only when circuits carry point detail.
  const hasPoints = panel.circuits.some(
    (c) => (c.fixtures ?? []).length > 0 || (c.sockets ?? []).length > 0,
  );
  if (hasPoints) {
    blocks.push(
      { text: 'Lighting & switching', style: 'h2', margin: [0, 12, 0, 6], pageBreak: 'before' },
      {
        svg: panelPointsSvg(panel, result, titleStripFor(project, 'Lighting & switching')),
        fit: [515, 640],
      },
    );
  }
  return blocks;
}

/**
 * A "Standards references" section listing each sizing rule the engine applies
 * and the PUIL 2011 (SNI 0225:2011) / IEC 60364 / IEC 60947 clause it follows.
 * The data comes from `@shared/standards` (STANDARD_REFERENCES), so the printed
 * citations stay in step with the engine's reference constants. English /
 * standard clause numbers only — this is a main-process document, no i18n.
 */
function standardsReferencesBlock(): Content[] {
  const header: TableCell[] = ['Sizing rule', 'PUIL 2011 / IEC clause'].map((t) => ({
    text: t,
    bold: true,
  }));
  const body: TableCell[][] = [header];
  for (const ref of STANDARD_REFERENCES) {
    body.push([ref.topic, ref.clause]);
  }
  return [
    heading('Standards references (PUIL 2011 / IEC 60364)'),
    {
      table: { headerRows: 1, widths: ['*', '*'], body },
      layout: 'lightHorizontalLines',
      fontSize: 7,
    },
    {
      text:
        'Results are engineering estimates — verify against PUIL 2011 (SNI 0225:2011) and the ' +
        'cited IEC standards before construction.',
      style: 'subtitle',
      fontSize: 7,
      margin: [0, 4, 0, 0],
    },
  ];
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

/** Today's date as an ISO calendar date (YYYY-MM-DD). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A professional title block shared by both reports: the company logo + name on
 * the left, and a key/value table of the project's title-block fields on the
 * right. Falls back to a minimal "PanelMaker" header when no branding metadata is
 * present, so reports for un-branded projects still read cleanly.
 */
function titleBlock(project: ProjectInput, reportTitle: string): Content[] {
  const meta: ProjectMeta = project.meta ?? {};

  // Left column: logo (when present) over the company / app name.
  const left: Content[] = [];
  if (meta.logoDataUrl) {
    left.push({ image: meta.logoDataUrl, fit: [150, 60], margin: [0, 0, 0, 6] });
  }
  left.push({ text: meta.companyName || 'PanelMaker', style: 'h1' });
  left.push({ text: reportTitle, style: 'subtitle', margin: [0, 2, 0, 0] });

  // Right column: the title-block key/value pairs (only rows with a value).
  const rows: TableCell[][] = [];
  const row = (label: string, value?: string) => {
    if (value) rows.push([{ text: label, bold: true, color: '#555' }, value]);
  };
  row('Project', project.name);
  row('Client', meta.client);
  row('Location', meta.location);
  row('Drawing no.', meta.drawingNumber);
  row('Project no.', meta.projectNumber);
  row('Revision', meta.revision);
  row('Engineer', meta.engineer);
  row('Date', today());

  const right: Content = {
    table: { widths: ['auto', '*'], body: rows.length ? rows : [['Project', project.name]] },
    layout: 'noBorders',
    fontSize: 9,
  };

  return [
    {
      columns: [
        { width: '*', stack: left },
        { width: 'auto', stack: [right] },
      ],
      columnGap: 16,
    },
    // Rule under the title block.
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.8, lineColor: '#888' }],
      margin: [0, 8, 0, 10],
    },
  ];
}

/**
 * The revision-history block (Rev | Date | Note | By), rendered from
 * `meta.revisions`. Returns an empty list when there is no revision history.
 */
function revisionBlock(project: ProjectInput): Content[] {
  const revisions = project.meta?.revisions ?? [];
  if (revisions.length === 0) return [];
  const header: TableCell[] = ['Rev', 'Date', 'Note', 'By'].map((t) => ({ text: t, bold: true }));
  const body: TableCell[][] = [header];
  for (const r of revisions) {
    body.push([r.rev, r.date, r.note, r.by ?? '']);
  }
  return [
    heading('Revision history'),
    {
      table: { headerRows: 1, widths: ['auto', 'auto', '*', 'auto'], body },
      layout: 'lightHorizontalLines',
      fontSize: 8,
    },
  ];
}

/** Find a panel's engine input within the project, by id. */
function panelInputFor(project: ProjectInput, panelId: string): PanelInput | undefined {
  return project.panels.find((p) => p.id === panelId);
}

/** Build the document definition for a single panel report. */
function panelDocDefinition(
  panel: PanelResult,
  project: ProjectInput,
): TDocumentDefinitions {
  const input = panelInputFor(project, panel.panelId);
  return {
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    pageMargins: [36, 36, 36, 48],
    content: [
      ...titleBlock(project, 'Panel Report'),
      heading(`Panel: ${panel.name}`),
      panelSpecTable(panel),
      heading('Circuit Schedule'),
      circuitScheduleTable(panel),
      ...(input ? panelDiagramsBlock(input, panel, project) : []),
      heading('Bill of Materials'),
      bomTable(bomLinesForPanel(panel)),
      ...revisionBlock(project),
      ...warningsBlock(panel.warnings),
      ...standardsReferencesBlock(),
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
  const content: Content[] = [...titleBlock(project, 'System Report')];

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
    const input = panelInputFor(project, panel.panelId);
    if (input) content.push(...panelDiagramsBlock(input, panel, project));
    allBom.push(...bomLinesForPanel(panel));
  }

  // Consolidated BOM + revision history + system warnings.
  content.push(heading('Consolidated Bill of Materials'));
  content.push(bomTable(allBom));
  content.push(...revisionBlock(project));
  content.push(...warningsBlock(system.warnings));
  content.push(...standardsReferencesBlock());

  return {
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    pageMargins: [36, 36, 36, 48],
    content,
  };
}

/* ----------------------------- circuit labels ----------------------------- */

/** Labels per row across the sheet (an Avery-style 3-up grid). */
const LABEL_COLUMNS = 3;

/** One printable circuit label / nameplate. */
interface LabelData {
  panelName: string;
  circuitName: string;
  breaker: string;
  cable: string;
  phase: string;
}

/** Human label for a circuit's phase assignment. */
function phaseLabel(phase: string): string {
  return phase === '3ph' ? '3-phase' : phase;
}

/** Collect one label per circuit across every panel in the computed system. */
function labelsForSystem(system: SystemResult): LabelData[] {
  const labels: LabelData[] = [];
  // Walk panels in root-first order for a stable, readable label sheet.
  for (const panelId of system.order) {
    const panel = system.panels[panelId];
    if (!panel) continue;
    for (const c of panel.circuits) {
      labels.push({
        panelName: panel.name,
        circuitName: c.name,
        breaker: `${c.breaker.ratingA} A ${c.breaker.deviceClass} ${c.breaker.curve}`,
        // Prefer the engine's human-readable cable make-up; fall back to the CSA.
        cable: c.grounding.cableSpec || `${c.cable.csaMm2} mm²`,
        phase: phaseLabel(c.phase),
      });
    }
  }
  return labels;
}

/** Render one label as a bordered cell (panel/circuit + breaker/cable/phase). */
function labelCell(label: LabelData | null): TableCell {
  if (!label) {
    // Empty filler cell to keep the final row a full grid; no border.
    return { text: '', border: [false, false, false, false] };
  }
  return {
    margin: [6, 6, 6, 6],
    stack: [
      { text: label.panelName, fontSize: 7, color: '#777' },
      { text: label.circuitName, bold: true, fontSize: 11, margin: [0, 1, 0, 3] },
      { text: label.breaker, fontSize: 8 },
      { text: label.cable, fontSize: 8 },
      { text: label.phase, fontSize: 8, color: '#555' },
    ],
  };
}

/** Build the document definition for the circuit-label sheet. */
function labelsDocDefinition(
  system: SystemResult,
  project: ProjectInput,
): TDocumentDefinitions {
  const labels = labelsForSystem(system);

  // Chunk the labels into rows of LABEL_COLUMNS, padding the last row.
  const body: TableCell[][] = [];
  for (let i = 0; i < labels.length; i += LABEL_COLUMNS) {
    const row: TableCell[] = [];
    for (let col = 0; col < LABEL_COLUMNS; col += 1) {
      row.push(labelCell(labels[i + col] ?? null));
    }
    body.push(row);
  }

  const content: Content[] = [...titleBlock(project, 'Circuit Labels')];
  if (labels.length === 0) {
    content.push({ text: 'No circuits to label.', style: 'subtitle' });
  } else {
    content.push({
      table: {
        widths: Array<string>(LABEL_COLUMNS).fill('*'),
        body,
      },
      // A boxed grid so each cell reads as a self-contained adhesive label.
      layout: {
        hLineColor: () => '#999',
        vLineColor: () => '#999',
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    });
  }

  return {
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    pageMargins: [24, 24, 24, 24],
    content,
  };
}

/* ------------------------------- quotation -------------------------------- */

/** Format a currency amount with thousands separators (no decimals). */
function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}`;
}

/** The quotation cost-breakdown table (Material → … → grand total). */
function quotationBreakdownTable(quote: QuotationResult): Content {
  const body: TableCell[][] = [
    [
      { text: 'Cost element', bold: true },
      { text: 'Basis', bold: true },
      { text: `Amount (${quote.currency})`, bold: true, alignment: 'right' },
    ],
  ];
  const s = quote.settings;
  const bases: Record<string, string> = {
    Material: 'priced bill of materials',
    Labor: `${quote.laborHours} h × ${fmtMoney(s.laborRatePerHour, quote.currency)}/h`,
    Overhead: `${s.overheadPct}% of material + labor`,
    Contingency: `${s.contingencyPct}% of material + labor`,
    Margin: `${s.marginPct}% of loaded cost`,
  };
  for (const section of quote.sections) {
    body.push([
      section.label,
      bases[section.label] ?? '',
      { text: fmtMoney(section.amount, quote.currency), alignment: 'right' },
    ]);
  }
  body.push([
    { text: 'Quoted total', bold: true },
    '',
    { text: fmtMoney(quote.grandTotal, quote.currency), bold: true, alignment: 'right' },
  ]);
  return {
    table: { headerRows: 1, widths: ['auto', '*', 'auto'], body },
    layout: 'lightHorizontalLines',
  };
}

/** A priced BOM table for the quotation (item / SKU / qty / unit / line total). */
function quotationBomTable(lines: BomLine[], currency: string): Content {
  const header: TableCell[] = [
    'Item',
    'Order code',
    'Qty',
    `Unit (${currency})`,
    `Total (${currency})`,
  ].map((t) => ({ text: t, bold: true }));
  const body: TableCell[][] = [header];
  for (const l of lines) {
    body.push([
      l.description,
      l.sku ?? '',
      String(l.qty),
      { text: l.matched && l.unitPrice !== undefined ? fmtMoney(l.unitPrice, '').trim() : '—', alignment: 'right' },
      { text: l.matched && l.lineTotal !== undefined ? fmtMoney(l.lineTotal, '').trim() : '—', alignment: 'right' },
    ]);
  }
  return {
    table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
  };
}

/** Build the document definition for the quotation / proposal. */
function quotationDocDefinition(
  system: SystemResult,
  project: ProjectInput,
  parts: Part[],
  prices: Map<string, number>,
): TDocumentDefinitions {
  // Consolidate every panel's BOM into one orderable, priced project BOM.
  const consolidated = consolidateBom(buildSystemBom(system, parts));
  const cost = costBom(consolidated, prices);
  const quote = computeQuotation({ lines: cost.lines, settings: project.meta?.quotation });

  const content: Content[] = [...titleBlock(project, 'Quotation / Proposal')];

  content.push(heading('Price summary'));
  content.push(quotationBreakdownTable(quote));
  if (cost.unmatchedCount > 0) {
    content.push({
      text: `Note: ${cost.unmatchedCount} bill-of-materials line(s) are unpriced and excluded from the material subtotal. Import a pricelist or match catalog parts to price them.`,
      style: 'subtitle',
      margin: [0, 6, 0, 0],
      fontSize: 8,
    });
  }

  content.push(heading('Bill of materials'));
  content.push(quotationBomTable(quote.lines, quote.currency));

  content.push(...revisionBlock(project));
  content.push({
    text: `Prices are engineering estimates — verify against current supplier quotations. Standards: ${quote.standardsVersion}.`,
    style: 'subtitle',
    margin: [0, 12, 0, 0],
    fontSize: 8,
  });

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

/** Generate the circuit-label sheet PDF as a Buffer. */
export function exportLabelsPdfBuffer(
  system: SystemResult,
  project: ProjectInput,
): Promise<Buffer> {
  return renderToBuffer(labelsDocDefinition(system, project));
}

/** Generate the quotation / proposal PDF as a Buffer. */
export function exportQuotationPdfBuffer(
  system: SystemResult,
  project: ProjectInput,
  parts: Part[],
  prices: Map<string, number>,
): Promise<Buffer> {
  return renderToBuffer(quotationDocDefinition(system, project, parts, prices));
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

/**
 * Compute + render the circuit-label sheet (a grid of per-circuit nameplates)
 * and write it to `filePath`. Recomputes from the project so the breaker/cable
 * specs on each label match the engine.
 */
export async function exportLabelsPdf(
  project: ProjectInput,
  filePath: string,
): Promise<ExportResult> {
  const system = computeProject(project);
  const buffer = await exportLabelsPdfBuffer(system, project);
  await writeFile(filePath, buffer);
  return { filePath, byteLength: buffer.byteLength };
}

/**
 * Compute + render the commercial quotation / proposal (priced consolidated BOM
 * + labor and mark-ups from the project's quotation settings) and write it to
 * `filePath`. The renderer passes its parts catalog and the partId→unit-price
 * map so the BOM is priced exactly as it appears on screen.
 */
export async function exportQuotationPdf(
  project: ProjectInput,
  parts: Part[],
  prices: Record<string, number>,
  filePath: string,
): Promise<ExportResult> {
  const system = computeProject(project);
  const priceMap = new Map<string, number>(Object.entries(prices));
  const buffer = await exportQuotationPdfBuffer(system, project, parts, priceMap);
  await writeFile(filePath, buffer);
  return { filePath, byteLength: buffer.byteLength };
}
