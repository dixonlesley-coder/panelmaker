import { describe, it, expect } from 'vitest';
import {
  derivedPointsLoadW,
  summarizeFinalCircuit,
  finalCircuitWarnings,
  computePanel,
  buildPanelBom,
  laborHoursForBom,
} from '@shared/engine';
import {
  MAX_POINTS_PER_LIGHTING_CIRCUIT,
  MAX_W_PER_CONVENTIONAL_GANG,
  MAX_W_PER_SMART_CHANNEL,
  VA_PER_SOCKET_POINT,
} from '@shared/standards/fixtures';
import { assemblyHoursForCategory } from '@shared/standards/labor';
import type { CircuitInput, PanelInput, Part } from '@shared/types';

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
    name: 'LP',
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

describe('derived point loads', () => {
  it('sums fixture rows: watts × qty', () => {
    const c = circuit({
      id: 'c1',
      name: 'Lights',
      fixtures: [
        { id: 'f1', name: 'Downlight 12 W', wattsPerFitting: 12, qty: 10 },
        { id: 'f2', name: 'TL LED 2×18 W', wattsPerFitting: 36, qty: 4 },
      ],
    });
    expect(derivedPointsLoadW(c)).toBe(12 * 10 + 36 * 4); // 264 W
  });

  it('plans sockets at the standard VA per point', () => {
    const c = circuit({
      id: 'c2',
      name: 'Sockets',
      loadKind: 'socket',
      isLighting: false,
      sockets: [
        { id: 's1', name: 'Wall A', qty: 4 },
        { id: 's2', name: 'Wall B', qty: 2 },
      ],
    });
    expect(derivedPointsLoadW(c)).toBe(6 * VA_PER_SOCKET_POINT);
  });

  it('returns undefined without point detail (flat loadW applies)', () => {
    expect(derivedPointsLoadW(circuit({ id: 'c3', name: 'Flat', loadW: 1200 }))).toBeUndefined();
  });

  it('honours a per-row VA override on socket outlets (editable load)', () => {
    const c = circuit({
      id: 'c5',
      name: 'Kitchen sockets',
      loadKind: 'socket',
      isLighting: false,
      sockets: [
        { id: 's1', name: 'Counter', qty: 3 }, // default planning VA
        { id: 's2', name: 'Oven', qty: 1, type: 'dedicated', vaPerPoint: 2200 },
      ],
    });
    expect(derivedPointsLoadW(c)).toBe(3 * VA_PER_SOCKET_POINT + 2200);
  });
});

describe('switch groups (conventional + smart)', () => {
  const base = {
    id: 'c4',
    name: 'Office lights',
    fixtures: [
      { id: 'f1', name: 'Downlight', wattsPerFitting: 12, qty: 20, switchGroupId: 'sw1' },
      { id: 'f2', name: 'Pendant', wattsPerFitting: 40, qty: 30, switchGroupId: 'sw2' },
      { id: 'f3', name: 'Strip', wattsPerFitting: 15, qty: 2 }, // unswitched
    ],
    switchGroups: [
      { id: 'sw1', label: 'SW1', kind: 'conventional' as const, gang: 1, ways: 1 as const },
      { id: 'sw2', label: 'SW2', kind: 'smart' as const, protocol: 'wifi' as const, neutralAtSwitch: false },
    ],
  };

  it('computes per-group controlled load and flags overload by kind', () => {
    const s = summarizeFinalCircuit(circuit(base))!;
    expect(s.kind).toBe('lighting');
    const sw1 = s.switchGroups.find((g) => g.groupId === 'sw1')!;
    const sw2 = s.switchGroups.find((g) => g.groupId === 'sw2')!;
    // SW1: 240 W on a 1-gang conventional — within 800 W.
    expect(sw1.loadW).toBe(240);
    expect(sw1.maxRecommendedW).toBe(MAX_W_PER_CONVENTIONAL_GANG);
    expect(sw1.overloaded).toBe(false);
    // SW2: 1200 W on a smart channel — above the 600 W LED planning ceiling.
    expect(sw2.loadW).toBe(1200);
    expect(sw2.maxRecommendedW).toBe(MAX_W_PER_SMART_CHANNEL);
    expect(sw2.overloaded).toBe(true);
    // The no-neutral smart module is flagged for the installer.
    expect(sw2.needsNeutralNote).toBe(true);
    // Two strip fittings are permanently live.
    expect(s.unswitchedFixtures).toBe(2);
  });

  it('emits the matching warnings (overload, neutral, unswitched, point count)', () => {
    const s = summarizeFinalCircuit(circuit(base))!;
    const warnings = finalCircuitWarnings(s, { id: 'c4', name: 'Office lights' }, 'P');
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('switch-group-overloaded');
    expect(codes).toContain('smart-switch-no-neutral');
    expect(codes).toContain('unswitched-fixtures');
    // 52 fittings > the 12-point lighting practice limit.
    expect(s.pointCount).toBe(52);
    expect(s.pointLimit).toBe(MAX_POINTS_PER_LIGHTING_CIRCUIT);
    expect(codes).toContain('too-many-points');
  });
});

describe('computePanel integration', () => {
  it('sizes the circuit from the derived point load and surfaces the summary', () => {
    const fixtures = [{ id: 'f1', name: 'Downlight', wattsPerFitting: 50, qty: 10, switchGroupId: 'sw1' }];
    const r = computePanel(
      panel([
        circuit({
          id: 'lit',
          name: 'Lit',
          loadW: 99999, // must be superseded by the 500 W derived load
          fixtures,
          switchGroups: [{ id: 'sw1', label: 'SW1', kind: 'conventional', gang: 1 }],
        }),
      ]),
    );
    const c = r.circuits[0]!;
    expect(c.finalCircuit?.derivedLoadW).toBe(500);
    // Ib from 500 W @ 220 V, cosφ 0.9 ≈ 2.5 A — clearly not from the flat 99999 W.
    expect(c.designCurrentA).toBeLessThan(5);
    expect(r.totalConnectedLoadW).toBe(500);
  });

  it('BOM carries fixture, switch and socket lines', () => {
    const parts: Part[] = [
      {
        id: 'sw-part',
        category: 'switch',
        manufacturer: 'X',
        model: '1g',
        attributes: {},
        defaultUnit: 'pcs',
      },
    ];
    const r = computePanel(
      panel([
        circuit({
          id: 'lit',
          name: 'Lit',
          fixtures: [{ id: 'f1', name: 'Downlight', wattsPerFitting: 12, qty: 8, switchGroupId: 'sw1' }],
          switchGroups: [{ id: 'sw1', label: 'SW1', kind: 'conventional', gang: 1 }],
        }),
        circuit({
          id: 'soc',
          name: 'Soc',
          loadKind: 'socket',
          isLighting: false,
          sockets: [{ id: 's1', name: 'Wall', qty: 6 }],
        }),
      ]),
    );
    const bom = buildPanelBom(r, parts);
    const fixtureLine = bom.find((l) => l.category === 'light_fixture');
    const switchLine = bom.find((l) => l.category === 'switch');
    const socketLine = bom.find((l) => l.category === 'socket_outlet');
    expect(fixtureLine?.qty).toBe(8);
    expect(switchLine?.qty).toBe(1);
    expect(switchLine?.matched).toBe(true); // matched against the catalog switch
    expect(socketLine?.qty).toBe(6);
  });

  it('point-install labor flows into the quotation labor hours', () => {
    const r = computePanel(
      panel([
        circuit({
          id: 'lit',
          name: 'Lit',
          fixtures: [{ id: 'f1', name: 'DL', wattsPerFitting: 12, qty: 8, switchGroupId: 'sw1' }],
          switchGroups: [{ id: 'sw1', label: 'SW1', kind: 'smart', protocol: 'wifi' }],
        }),
        circuit({
          id: 'soc',
          name: 'Soc',
          loadKind: 'socket',
          isLighting: false,
          sockets: [{ id: 's1', name: 'Wall', qty: 6 }],
        }),
      ]),
    );
    const bom = buildPanelBom(r, []);
    // 8 fittings + 1 smart switch + 6 outlets each carry their own install labor.
    const pointHours =
      8 * assemblyHoursForCategory('light_fixture') +
      1 * assemblyHoursForCategory('smart_switch') +
      6 * assemblyHoursForCategory('socket_outlet');
    expect(laborHoursForBom(bom)).toBeGreaterThanOrEqual(pointHours - 1e-9);
    // The new categories are explicitly costed (not the generic 0.25 fallback),
    // and a smart module takes more labor than a conventional switch.
    expect(assemblyHoursForCategory('smart_switch')).toBeGreaterThan(
      assemblyHoursForCategory('switch'),
    );
    expect(assemblyHoursForCategory('light_fixture')).not.toBe(0.25);
  });
});
