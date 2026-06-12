import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem, computePowerOneline } from '@shared/engine';
import { submeterFor } from '@shared/engine/metering';
import { buildPanelBom } from '@shared/engine/bom';
import { CATALOG_PARTS } from '@shared/data/catalog';
import type { CircuitInput, PanelInput, ProjectInput, Part } from '@shared/types';

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
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...partial,
  };
}

describe('manual changeover (COS)', () => {
  const prj = (transfer?: 'ats' | 'manual', lifeSafety = false): ProjectInput => ({
    id: 'x',
    name: 'X',
    sources: { generator: { enabled: true, backupFraction: 1, mode: 'standby', ...(transfer ? { transfer } : {}) } },
    panels: [
      panel({
        id: 'P',
        name: 'MDP',
        circuits: [branch({ id: 'c1', name: 'Load', loadW: 20000 }), ...(lifeSafety ? [branch({ id: 'fp', name: 'Fire pump', loadKind: 'pump', motorKw: 15, starterType: 'DOL', lifeSafety: true })] : [])],
      }),
    ],
  });

  it('labels the transfer device COS and adapts the interlock notes', () => {
    const ol = computePowerOneline(computeSystem(prj('manual')));
    const node = ol.nodes.find((n) => n.kind === 'ats')!;
    expect(node.label).toBe('COS');
    expect(ol.interlocks.some((il) => il.note.includes('operator'))).toBe(true);

    const auto = computePowerOneline(computeSystem(prj()));
    expect(auto.nodes.find((n) => n.kind === 'ats')!.label).toBe('ATS');
    expect(computeSystem(prj()).sources?.generator?.transfer).toBe('ats');
  });

  it('warns when life-safety circuits ride a manual changeover', () => {
    expect(computeSystem(prj('manual', true)).warnings.some((w) => w.code === 'life-safety-manual-transfer')).toBe(true);
    expect(computeSystem(prj('ats', true)).warnings.some((w) => w.code === 'life-safety-manual-transfer')).toBe(false);
  });
});

describe('tenant sub-metering', () => {
  it('picks direct vs CT metering from the demand current', () => {
    expect(submeterFor(60)).toEqual({ metering: 'direct' });
    const ct = submeterFor(180);
    expect(ct.metering).toBe('ct');
    expect(ct.ctRatio).toMatch(/^\d+\/5$/);
  });

  it('lands on the panel result and in the BOM (meter + 3 CTs when CT-operated)', () => {
    const p = panel({
      id: 'P',
      name: 'Tenant DB',
      submeter: true,
      circuits: [branch({ id: 'c1', name: 'Load', loadW: 150000, cosPhi: 0.9 })],
    });
    const r = computePanel(p);
    expect(r.submeter).toBeDefined();
    expect(r.submeter!.metering).toBe('ct');
    const lines = buildPanelBom(r, [...CATALOG_PARTS] as Part[]);
    expect(lines.some((l) => l.category === 'panel_meter')).toBe(true);
    const cts = lines.find((l) => l.category === 'current_transformer');
    expect(cts?.qty).toBe(3);

    const plain = computePanel(panel({ id: 'P2', name: 'No meter', circuits: [branch({ id: 'c', name: 'L', loadW: 2000 })] }));
    expect(plain.submeter).toBeUndefined();
  });
});

describe('dual-transformer supply', () => {
  const prj = (dual: boolean, loadW = 100000): ProjectInput => ({
    id: 'x',
    name: 'X',
    ...(dual ? { meta: { dualTransformer: true } } : {}),
    panels: [panel({ id: 'P', name: 'MDP', circuits: [branch({ id: 'c1', name: 'Load', loadW })] })],
  });

  it('forces an MV service even below the 200 kVA LV ceiling', () => {
    const single = computeSystem(prj(false));
    expect(single.supply.type).toBe('LV'); // ~118 kVA — normally direct LV
    const dual = computeSystem(prj(true));
    expect(dual.supply.type).toBe('MV');
    expect(dual.supply.transformerCount).toBe(2);
  });

  it('sizes each unit for half the demand; fault level stays one unit', () => {
    const big = computeSystem(prj(false, 400000)); // ~470 kVA → single MV
    const dual = computeSystem(prj(true, 400000));
    expect(dual.supply.transformerKva).toBeLessThan(big.supply.transformerKva ?? Infinity);
    expect(dual.supply.note).toContain('2 ×');
    expect(dual.supply.note).toContain('NORMALLY OPEN'.toLowerCase().includes('x') ? 'x' : 'coupler');
    // Fault basis = per-unit kVA → the boards see a LOWER fault than one big unit.
    const dualFault = dual.panels['P']!.faultLevelKa ?? 0;
    const bigFault = big.panels['P']!.faultLevelKa ?? 0;
    expect(dualFault).toBeLessThan(bigFault);
  });

  it('draws T1 + T2 and the coupler interlock on the one-line', () => {
    const ol = computePowerOneline(computeSystem(prj(true, 400000)));
    const txs = ol.nodes.filter((n) => n.kind === 'transformer');
    expect(txs).toHaveLength(2);
    expect(txs.map((n) => n.label)).toEqual(['Transformer T1', 'Transformer T2']);
    expect(ol.edges.some((e) => e.from === 'tx2' && e.to === 'bus')).toBe(true);
    const coupler = ol.interlocks.find((il) => il.id === 'il-coupler');
    expect(coupler).toBeDefined();
    expect(coupler!.note).toContain('NORMALLY OPEN');
  });
});

describe('secondary SPDs at distant sub-boards', () => {
  it('recommends a Type 2 on a sub-board beyond ~10 m of feeder, not nearby ones', () => {
    const prj: ProjectInput = {
      id: 'x',
      name: 'X',
      panels: [
        panel({
          id: 'mdp',
          name: 'MDP',
          circuits: [
            branch({ id: 'f1', name: 'Feeder near', loadKind: 'feeder', feedsPanelId: 'near', lengthM: 5 }),
            branch({ id: 'f2', name: 'Feeder far', loadKind: 'feeder', feedsPanelId: 'far', lengthM: 40 }),
          ],
        }),
        panel({ id: 'near', name: 'Near DB', sourceType: 'feeder', fedByCircuitId: 'f1', circuits: [branch({ id: 'n1', name: 'L', loadW: 3000 })] }),
        panel({ id: 'far', name: 'Far DB', sourceType: 'feeder', fedByCircuitId: 'f2', circuits: [branch({ id: 'x1', name: 'L', loadW: 3000 })] }),
      ],
    };
    const r = computeSystem(prj);
    expect(r.panels['far']!.spd?.recommended).toBe(true);
    expect(r.panels['far']!.spd?.type).toContain('2');
    expect(r.panels['near']!.spd).toBeUndefined();
    expect(r.panels['mdp']!.spd).toBeUndefined(); // origin uses the system-level SPD
  });
});
