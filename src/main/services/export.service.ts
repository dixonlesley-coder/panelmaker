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
import {
  circuitTag,
  panelGaSheet,
  panelPointsSheet,
  panelSldSheet,
  pdfGlyphs,
  type SheetTitleBlock,
} from '@shared/drawing';
import { panelLabel } from '@shared/labels';
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

/** Power in kW (engineers read kW on schedules, not raw W). */
function fmtKw(w: number): string {
  return `${(w / 1000).toFixed(2)} kW`;
}

/* --- shared "engineering schedule" table styling (shaded header, thin grid,
   zebra rows) so the report reads like a drawing-office document, not a web
   table. Reused by every data table. --- */
const HEADER_FILL = '#23405e';
const ZEBRA_FILL = '#eef2f6';
const GRID = '#9aa7b4';

const scheduleLayout = {
  fillColor: (rowIndex: number) => (rowIndex === 0 ? HEADER_FILL : rowIndex % 2 === 0 ? ZEBRA_FILL : null),
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => GRID,
  vLineColor: () => GRID,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: () => 5,
  paddingRight: () => 5,
} as const;

/** A thin-grid layout with no header shading (for the panel data block). */
const dataBlockLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => GRID,
  vLineColor: () => GRID,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: () => 5,
  paddingRight: () => 5,
} as const;

/** White, bold header cell for a schedule table (optionally right-aligned). */
function hcell(text: string, align: 'left' | 'right' | 'center' = 'left'): TableCell {
  return { text, bold: true, color: '#ffffff', alignment: align };
}

/** Shaded label cell + plain value cell for the panel data block. */
function lcell(text: string): TableCell {
  return { text, bold: true, color: '#33414f', fillColor: ZEBRA_FILL };
}

/** Section heading. */
function heading(text: string): Content {
  return { text, style: 'h2', margin: [0, 12, 0, 6] };
}

/** Remarks for a circuit row — the engineering flags an installer/checker needs
 *  (spare, RCD, life-safety, and any non-compliance), comma-separated. */
function circuitRemarks(c: PanelResult['circuits'][number]): string {
  const r: string[] = [];
  if (c.loadKind === 'spare') r.push('SPARE');
  if (c.lifeSafety) r.push('life-safety (FRC)');
  if (c.rcd?.required) r.push(`RCD${c.rcd.type ? ` ${c.rcd.type}` : ''} ${c.rcd.ratingMa ?? 30} mA`);
  if (c.instantaneousTrips === false) r.push('no inst. trip');
  if (c.phaseWithstandOk === false) r.push('cable I²t');
  if (!c.voltageDrop.withinLimit) r.push(`ΔU > ${c.voltageDrop.limitPercent}%`);
  if (c.kaAdequate === false) r.push('Icu < Isc');
  if (c.disconnectsInTime === false) r.push('Zs high');
  return r.join(', ');
}

/** Build the circuit-schedule table for one panel — a conventional electrical
 *  circuit schedule (way no., load, phase, protective device, conductor, design
 *  current, voltage drop, remarks). */
function circuitScheduleTable(panel: PanelResult): Content {
  const header: TableCell[] = [
    hcell('No.'),
    hcell('Load description'),
    hcell('Ph', 'center'),
    hcell('Protective device'),
    hcell('Icu kA', 'right'),
    hcell('Conductor'),
    hcell('I b (A)', 'right'),
    hcell('ΔU %', 'right'),
    hcell('Remarks'),
  ];

  const body: TableCell[][] = [header];
  panel.circuits.forEach((c, i) => {
    const spare = c.loadKind === 'spare';
    const poles = c.phase === '3ph' ? '3P' : '1P';
    const device = spare
      ? '—'
      : `${poles} ${c.breaker.ratingA} A ${c.breaker.curve} ${c.breaker.deviceClass}`;
    const vdOver = !c.voltageDrop.withinLimit;
    body.push([
      { text: circuitTag(i), bold: true },
      pdfGlyphs(c.name),
      { text: c.phase === '3ph' ? '3' : '1', alignment: 'center' },
      device,
      { text: c.breakerKa !== undefined ? String(c.breakerKa) : '—', alignment: 'right' },
      // The full cable make-up (cores + section + PE) reads better than a bare CSA.
      spare ? '—' : c.grounding.cableSpec || `${c.cable.csaMm2} mm²`,
      { text: spare ? '—' : c.designCurrentA.toFixed(1), alignment: 'right' },
      { text: spare ? '—' : c.voltageDrop.dropPercent.toFixed(2), alignment: 'right', ...(vdOver ? { color: '#c0212f', bold: true } : {}) },
      { text: circuitRemarks(c), fontSize: 7 },
    ]);
  });

  return {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body,
    },
    layout: scheduleLayout,
    fontSize: 8,
  };
}

/** Panel data block — the schedule header an electrician reads first: supply,
 *  ratings, incomer, fault level, busbar, enclosure. Laid out as a compact
 *  bordered grid (label · value · label · value), not a vertical list. */
function panelHeaderBlock(panel: PanelResult, input?: PanelInput): Content {
  const b = panel.busbar;
  const e = panel.enclosure;
  const inc = panel.incomer;
  const threePh = input?.system === '3ph';
  const volts = input ? `${input.voltageV} V` : '—';
  const sys = threePh ? '3-phase, 4-wire (R-S-T-N-PE)' : '1-phase, 2-wire (L-N-PE)';
  const incomer = `${inc.poles}P ${inc.breaker.ratingA} A ${inc.breaker.curve} ${inc.breaker.deviceClass}${
    inc.breakerKa !== undefined ? ` · ${inc.breakerKa} kA` : ''
  }`;
  const fault = panel.faultLevelKa !== undefined ? `${panel.faultLevelKa.toFixed(1)} kA` : '—';
  const pb = panel.phaseBalance;
  const loading = threePh
    ? `${pb.L1.toFixed(0)} / ${pb.L2.toFixed(0)} / ${pb.L3.toFixed(0)} A · ${pb.imbalancePct.toFixed(0)}% imb.`
    : 'n/a (1-phase)';

  const pair = (l1: string, v1: string, l2: string, v2: string): TableCell[] => [
    lcell(l1),
    { text: v1 },
    lcell(l2),
    { text: v2 },
  ];
  const body: TableCell[][] = [
    pair('Supply', volts, 'System', sys),
    pair('Connected load', fmtKw(panel.totalConnectedLoadW), 'Demand current', fmtA(panel.totalDemandCurrentA)),
    pair('Main incomer', incomer, 'Fault level (Isc)', fault),
    pair('Busbar', `${b.widthMm}×${b.thicknessMm} mm Cu — ${b.ampacityA} A`, 'Enclosure W×H×D', `${e.widthMm}×${e.heightMm}×${e.depthMm} mm · ${e.sheetThicknessMm} mm`),
    pair('Phase loading R-S-T', loading, 'Modules · heat', `${e.modules} mod · ${e.totalHeatW} W (${e.ventilation})`),
  ];
  return {
    table: { widths: ['auto', '*', 'auto', '*'], body },
    layout: dataBlockLayout,
    fontSize: 8.5,
    margin: [0, 0, 0, 2],
  };
}

/**
 * The common title-block fields (company / project / client / drawing number /
 * revision / engineer / date) for every drawing sheet in a report, derived from
 * the project metadata. The per-sheet `sheet`/`scale` fields are set by the sheet
 * builders.
 */
function sheetTitleBlock(project: ProjectInput): SheetTitleBlock {
  const m: ProjectMeta = project.meta ?? {};
  const tb: SheetTitleBlock = { project: project.name, date: today() };
  if (m.companyName) tb.company = m.companyName;
  if (m.client) tb.client = m.client;
  if (m.location) tb.location = m.location;
  if (m.drawingNumber) tb.drawingNumber = m.drawingNumber;
  if (m.projectNumber) tb.projectNumber = m.projectNumber;
  if (m.revision) tb.revision = m.revision;
  if (m.engineer) tb.engineer = m.engineer;
  return tb;
}

/** Printable area of a landscape A4 page (pt), inside the document margins. */
const LANDSCAPE_FIT: [number, number] = [752, 500];

/**
 * The CAD drawing sheets for one panel — each a full landscape A4 plate with a
 * border, title block and legible paper-fixed annotation — as their own pages.
 * The SLD and GA are always emitted; a lighting & small-power plan is added only
 * when the panel's circuits carry point detail.
 */
function panelDrawingPages(
  panel: PanelInput,
  result: PanelResult,
  project: ProjectInput,
): Content[] {
  const tb = sheetTitleBlock(project);
  const name = panelLabel(result);
  const sheet = (svg: string): Content => ({
    svg,
    fit: LANDSCAPE_FIT,
    alignment: 'center',
    pageBreak: 'before',
    pageOrientation: 'landscape',
  });
  const pages: Content[] = [
    sheet(panelSldSheet(panel, result, { ...tb, sheet: `Single-Line Diagram — ${name}` })),
    sheet(panelGaSheet(panel, result, { ...tb, sheet: `General Arrangement — ${name}` })),
  ];
  const hasPoints = panel.circuits.some(
    (c) => (c.fixtures ?? []).length > 0 || (c.sockets ?? []).length > 0,
  );
  if (hasPoints) {
    pages.push(sheet(panelPointsSheet(panel, result, { ...tb, sheet: `Lighting & Small Power — ${name}` })));
  }
  return pages;
}

/**
 * A "Standards references" section listing each sizing rule the engine applies
 * and the PUIL 2011 (SNI 0225:2011) / IEC 60364 / IEC 60947 clause it follows.
 * The data comes from `@shared/standards` (STANDARD_REFERENCES), so the printed
 * citations stay in step with the engine's reference constants. English /
 * standard clause numbers only — this is a main-process document, no i18n.
 */
function standardsReferencesBlock(): Content[] {
  const header: TableCell[] = [hcell('Sizing rule'), hcell('PUIL 2011 / IEC clause')];
  const body: TableCell[][] = [header];
  for (const ref of STANDARD_REFERENCES) {
    body.push([ref.topic, ref.clause]);
  }
  return [
    heading('Standards references (PUIL 2011 / IEC 60364)'),
    {
      table: { headerRows: 1, widths: ['*', '*'], body },
      layout: scheduleLayout,
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
    // Spares carry no devices/cable on the BOM.
    if (c.loadKind === 'spare') continue;
    // Device descriptions OMIT the circuit name so identical items aggregate into
    // one ordered quantity (a BOM is a purchasing list, not a per-circuit log).
    const poles = c.phase === '3ph' ? '3P' : '1P';
    lines.push({
      description: pdfGlyphs(`${c.breaker.deviceClass} ${poles} ${c.breaker.ratingA} A curve ${c.breaker.curve}`),
      category: 'breaker',
      qty: 1,
      matched: false,
    });
    lines.push({
      description: pdfGlyphs(`Cable ${c.grounding.cableSpec || `${c.cable.csaMm2} mm²`}`),
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

/** Render a BOM table — identical items aggregated into one quantity, ordered by
 *  category then description (a purchasing list, not a per-circuit log). */
function bomTable(lines: BomLine[]): Content {
  // Aggregate by category + description, summing quantities.
  const agg = new Map<string, BomLine>();
  for (const l of lines) {
    const key = `${l.category} ${l.description}`;
    const cur = agg.get(key);
    if (cur) cur.qty += l.qty;
    else agg.set(key, { ...l });
  }
  const sorted = [...agg.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.description.localeCompare(b.description),
  );

  const prettyCategory = (c: string) =>
    c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
  const header: TableCell[] = [hcell('#'), hcell('Description'), hcell('Category'), hcell('Qty', 'right')];
  const body: TableCell[][] = [header];
  sorted.forEach((l, i) => {
    body.push([
      { text: String(i + 1), alignment: 'right' },
      l.description,
      prettyCategory(l.category),
      { text: String(l.qty), alignment: 'right' },
    ]);
  });
  return {
    table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto'], body },
    layout: scheduleLayout,
    fontSize: 8,
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
  const header: TableCell[] = [hcell('Rev'), hcell('Date'), hcell('Note'), hcell('By')];
  const body: TableCell[][] = [header];
  for (const r of revisions) {
    body.push([r.rev, r.date, r.note, r.by ?? '']);
  }
  return [
    heading('Revision history'),
    {
      table: { headerRows: 1, widths: ['auto', 'auto', '*', 'auto'], body },
      layout: scheduleLayout,
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
      heading(`Panel schedule — ${panelLabel(panel)}`),
      panelHeaderBlock(panel, input),
      heading('Circuit schedule'),
      circuitScheduleTable(panel),
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
      // Drawing sheets last, as a landscape appendix.
      ...(input ? panelDrawingPages(input, panel, project) : []),
    ],
  };
}

/** Build the document definition for the whole-system report. */
function systemDocDefinition(
  system: SystemResult,
  project: ProjectInput,
): TDocumentDefinitions {
  const content: Content[] = [...titleBlock(project, 'System Report')];

  // System summary — supply, totals and power factor at a glance.
  content.push(heading('System summary'));
  const sup = system.supply;
  const supplyDesc = `${sup.type === 'MV' ? 'MV (transformer)' : 'LV (PLN direct)'}${
    sup.transformerKva ? ` · ${sup.transformerKva} kVA` : ''
  }`;
  const pf = system.powerFactor;
  const summaryRows: TableCell[][] = [
    [lcell('Project'), { text: project.name }, lcell('Panels'), { text: String(system.totals.panelCount) }],
    [lcell('Supply'), { text: supplyDesc }, lcell('Total connected load'), { text: fmtKw(system.totals.connectedLoadW) }],
  ];
  if (pf && pf.needed && pf.bankKvar > 0) {
    summaryRows.push([
      lcell('Power-factor correction'),
      { text: `${pf.bankKvar} kvar bank` },
      lcell('Target PF'),
      { text: pf.targetPf !== undefined ? pf.targetPf.toFixed(2) : '—' },
    ]);
  }
  content.push({
    table: { widths: ['auto', '*', 'auto', '*'], body: summaryRows },
    layout: dataBlockLayout,
    fontSize: 8.5,
  });

  // Per-panel schedule sections in root-first order; the drawing sheets are
  // collected into a single landscape appendix at the end of the report.
  const allBom: BomLine[] = [];
  const drawingPages: Content[] = [];
  for (const panelId of system.order) {
    const panel = system.panels[panelId];
    if (!panel) continue;
    const input = panelInputFor(project, panel.panelId);
    content.push(heading(`Panel schedule — ${panelLabel(panel)}`));
    content.push(panelHeaderBlock(panel, input));
    content.push({ text: 'Circuit schedule', style: 'h2', margin: [0, 6, 0, 4] });
    content.push(circuitScheduleTable(panel));
    if (input) drawingPages.push(...panelDrawingPages(input, panel, project));
    allBom.push(...bomLinesForPanel(panel));
  }

  // Consolidated BOM + revision history + system warnings.
  content.push(heading('Consolidated Bill of Materials'));
  content.push(bomTable(allBom));
  content.push(...revisionBlock(project));
  content.push(...warningsBlock(system.warnings));
  content.push(...standardsReferencesBlock());

  // Landscape drawing appendix (SLD + GA per panel).
  content.push(...drawingPages);

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
        circuitName: pdfGlyphs(c.name),
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
