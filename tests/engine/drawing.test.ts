import { describe, it, expect } from 'vitest';
import { computePanel } from '@shared/engine';
import { panelGaSvg, panelSldSvg, panelGaDxf, panelSldDxf } from '@shared/drawing';
import type { PanelInput, CircuitInput } from '@shared/types';

function branch(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...partial,
  };
}

function panel(partial: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

const SAMPLE = panel({
  id: 'P1',
  name: 'Lighting & Power DB',
  circuits: [
    branch({ id: 'c1', name: 'Lighting 1', loadW: 2000, loadKind: 'lighting', isLighting: true }),
    branch({ id: 'c2', name: 'Sockets', loadW: 3000 }),
    branch({ id: 'c3', name: 'AC unit', loadW: 4500, loadKind: 'motor', motorKw: 4, starterType: 'DOL' }),
    branch({ id: 'c4', name: 'Pump motor', loadW: 0, loadKind: 'motor', motorKw: 15, starterType: 'STAR_DELTA' }),
  ],
});

/** Count occurrences of a literal substring. */
function count(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

describe('panel general-arrangement SVG', () => {
  it('is a self-contained <svg> with a viewBox', () => {
    const svg = panelGaSvg(SAMPLE, computePanel(SAMPLE));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('draws at least one device rect per branch circuit', () => {
    const result = computePanel(SAMPLE);
    const svg = panelGaSvg(SAMPLE, result);
    // Cabinet, gutter, chamber + one rect per device → strictly more than the
    // branch count, so >= is a safe lower bound.
    expect(count(svg, '<rect')).toBeGreaterThanOrEqual(result.circuits.length);
  });

  it('uses only attribute styling (no CSS classes or foreignObject)', () => {
    const svg = panelGaSvg(SAMPLE, computePanel(SAMPLE));
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('<style');
  });
});

describe('panel single-line SVG', () => {
  it('is a self-contained <svg> with a viewBox', () => {
    const svg = panelSldSvg(SAMPLE, computePanel(SAMPLE));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
  });

  it('draws a breaker + load rect per branch', () => {
    const result = computePanel(SAMPLE);
    const svg = panelSldSvg(SAMPLE, result);
    // Each branch contributes a breaker rect and a load rect.
    expect(count(svg, '<rect')).toBeGreaterThanOrEqual(result.circuits.length * 2);
  });

  it('escapes XML-significant characters in labels', () => {
    const tricky = panel({
      id: 'P2',
      name: 'A & B <main>',
      circuits: [branch({ id: 'x', name: 'R&D "lab"', loadW: 1000 })],
    });
    const svg = panelSldSvg(tricky, computePanel(tricky));
    expect(svg).toContain('A &amp; B &lt;main&gt;');
    expect(svg).toContain('R&amp;D &quot;lab&quot;');
  });
});

describe('drawing title-strip (optional branding)', () => {
  it('is omitted by default, leaving the diagram unchanged', () => {
    const result = computePanel(SAMPLE);
    const plain = panelSldSvg(SAMPLE, result);
    const withEmpty = panelSldSvg(SAMPLE, result, {});
    // An empty strip has no content → no extra markup is emitted.
    expect(withEmpty).toBe(plain);
  });

  it('renders the supplied title-block fields when provided', () => {
    const result = computePanel(SAMPLE);
    const svg = panelSldSvg(SAMPLE, result, {
      company: 'Acme Engineering',
      project: 'Tower 5',
      sheet: 'Single-line diagram',
      drawingNumber: 'E-101',
      revision: 'B',
    });
    expect(svg).toContain('Acme Engineering');
    expect(svg).toContain('E-101');
    // still a self-contained, attribute-styled SVG
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('class=');
  });

  it('escapes XML-significant characters in title-strip text', () => {
    const result = computePanel(SAMPLE);
    const svg = panelGaSvg(SAMPLE, result, { company: 'A & B <co>' });
    expect(svg).toContain('A &amp; B &lt;co&gt;');
  });
});

describe('panel DXF export', () => {
  it('emits a well-formed R12 ENTITIES document', () => {
    const dxf = panelGaDxf(SAMPLE, computePanel(SAMPLE));
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('ENDSEC');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });

  it('emits LINE and TEXT entities for the single-line diagram', () => {
    const dxf = panelSldDxf(SAMPLE, computePanel(SAMPLE));
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('EOF');
  });

  it('strips newlines from text so group codes stay aligned', () => {
    const tricky = panel({
      id: 'P3',
      name: 'Line1\nLine2',
      circuits: [branch({ id: 'y', name: 'load', loadW: 1000 })],
    });
    const dxf = panelSldDxf(tricky, computePanel(tricky));
    expect(dxf).toContain('Line1 Line2');
    expect(dxf).not.toContain('Line1\nLine2');
  });
});
