import { describe, it, expect } from 'vitest';
import { computePanel } from '@shared/engine';
import { panelPointsSvg, panelPointsDxf, pointsDrawing } from '@shared/drawing';
import type { CircuitInput, PanelInput } from '@shared/types';

function circuit(partial: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.9,
    lengthM: 20,
    loadKind: 'lighting',
    isLighting: true,
    demandFactor: 1,
    ...partial,
  };
}

function panel(circuits: CircuitInput[]): PanelInput {
  return {
    id: 'P',
    name: 'LP-1',
    system: '1ph',
    voltageV: 220,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 0.8,
    sourceType: 'utility',
    circuits,
  };
}

const pointPanel = panel([
  circuit({
    id: 'lit',
    name: 'Office <lights>', // angle brackets exercise XML escaping
    fixtures: [
      { id: 'f1', name: 'Downlight 12 W', wattsPerFitting: 12, qty: 8, switchGroupId: 'sw1' },
      { id: 'f2', name: 'Pendant 40 W', wattsPerFitting: 40, qty: 4, switchGroupId: 'sw2' },
      { id: 'f3', name: 'Exit sign', wattsPerFitting: 5, qty: 2 }, // unswitched
    ],
    switchGroups: [
      { id: 'sw1', label: 'SW1', kind: 'conventional', gang: 2, ways: 2 },
      { id: 'sw2', label: 'SW2', kind: 'smart', protocol: 'zigbee', neutralAtSwitch: true },
    ],
  }),
  circuit({
    id: 'soc',
    name: 'Sockets',
    loadKind: 'socket',
    isLighting: false,
    sockets: [
      { id: 's1', name: 'Wall east', qty: 4 },
      { id: 's2', name: 'Oven', qty: 1, type: 'dedicated', vaPerPoint: 2200 },
    ],
  }),
  circuit({ id: 'plain', name: 'Flat load', loadW: 1000 }), // no points — not drawn
]);

describe('points & switching drawing', () => {
  const result = computePanel(pointPanel);

  it('renders a valid SVG with every point-modelled circuit and symbol labels', () => {
    const svg = panelPointsSvg(pointPanel, result);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Circuit names appear — XML-escaped, never raw.
    expect(svg).toContain('Office &lt;lights&gt;');
    expect(svg).not.toContain('Office <lights>');
    expect(svg).toContain('Sockets');
    // Switch labels with the smart protocol, and the unswitched branch.
    expect(svg).toContain('SW1');
    expect(svg).toContain('SW2 (zigbee)');
    expect(svg).toContain('unswitched');
    // Fixture and socket rows with quantities and per-point load.
    expect(svg).toContain('8 × Downlight 12 W (12 W)');
    expect(svg).toContain('1 × Oven (2200 VA, dedicated)');
    expect(svg).toContain('4 × Wall east (200 VA)');
    // The flat circuit carries no points and is not drawn.
    expect(svg).not.toContain('Flat load');
  });

  it('tags each band with its breaker from the computed result', () => {
    const lit = result.circuits.find((c) => c.circuitId === 'lit')!;
    const svg = panelPointsSvg(pointPanel, result);
    expect(svg).toContain(`${lit.breaker.deviceClass} ${lit.breaker.ratingA} A ${lit.breaker.curve}`);
  });

  it('emits the same geometry as DXF', () => {
    const dxf = panelPointsDxf(pointPanel, result);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('draws an explanatory note for a panel without point detail', () => {
    const bare = panel([circuit({ id: 'x', name: 'X', loadW: 500 })]);
    const d = pointsDrawing(bare, computePanel(bare));
    const texts = d.prims.filter((p) => p.type === 'text');
    expect(texts.some((p) => p.type === 'text' && p.text.includes('No point-modelled circuits'))).toBe(true);
  });

  it('grows the drawing height with content', () => {
    const small = panel([
      circuit({
        id: 'a',
        name: 'A',
        fixtures: [{ id: 'f', name: 'L', wattsPerFitting: 10, qty: 1 }],
      }),
    ]);
    const dSmall = pointsDrawing(small, computePanel(small));
    const dBig = pointsDrawing(pointPanel, result);
    expect(dBig.height).toBeGreaterThan(dSmall.height);
  });
});
