import { describe, it, expect } from 'vitest';
import { computeSystem, panelCompliance, complianceStatus } from '@shared/engine';
import { nextDaya, dayaTiers, formatDaya, PLN_DAYA_VA_3PH } from '@shared/standards';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';
import type { CircuitResult, PanelResult } from '@shared/types/results';

function branch(p: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return { role: 'branch', loadW: 0, cosPhi: 0.85, lengthM: 20, loadKind: 'general', isLighting: false, demandFactor: 1, ...p };
}
function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return { system: '3ph', voltageV: 400, ambientTempC: 30, installMethod: 'conduit', groupingCount: 1, diversityFactor: 1, sourceType: 'utility', circuits: [], ...p };
}

describe('PLN connected power (daya tersambung)', () => {
  it('picks the next standard step at or above the demand', () => {
    expect(nextDaya(20000, 3)).toBe(23000); // 23 kVA step
    expect(nextDaya(23000, 3)).toBe(23000); // exact match
    expect(nextDaya(1000, 1)).toBe(1300); // 1ph
    expect(nextDaya(900, 1)).toBe(900);
    // Beyond the LV catalogue → clamps to the largest published step.
    expect(nextDaya(5_000_000, 3)).toBe(PLN_DAYA_VA_3PH[PLN_DAYA_VA_3PH.length - 1]);
  });

  it('exposes the tier list per phase and a readable format', () => {
    expect(dayaTiers(1)[0]).toBe(450);
    expect(dayaTiers(3)).toContain(23000);
    expect(formatDaya(23000)).toBe('23,000 VA (23 kVA)');
  });
});

describe('computeSystem daya recommendation + warning', () => {
  const project = (contractedDayaVa?: number): ProjectInput => ({
    id: 'P', name: 'T',
    meta: contractedDayaVa !== undefined ? { contractedDayaVa } : undefined,
    panels: [panel({ id: 'mdp', name: 'MDP', circuits: [branch({ id: 'c1', name: 'Load', loadW: 30000 })] })],
  });

  it('recommends a standard daya step from the demand', () => {
    const sys = computeSystem(project());
    expect(sys.supply.recommendedDayaVa).toBeGreaterThan(0);
    expect(PLN_DAYA_VA_3PH).toContain(sys.supply.recommendedDayaVa);
    expect(sys.warnings.some((w) => w.code === 'demand-exceeds-daya')).toBe(false);
  });

  it('warns when demand exceeds the contracted daya', () => {
    const sys = computeSystem(project(13200)); // contract well below ~30 kVA demand
    expect(sys.supply.contractedDayaVa).toBe(13200);
    expect(sys.warnings.some((w) => w.code === 'demand-exceeds-daya')).toBe(true);
  });

  it('does not warn when the contract covers the demand', () => {
    const sys = computeSystem(project(200000));
    expect(sys.warnings.some((w) => w.code === 'demand-exceeds-daya')).toBe(false);
  });
});

describe('per-panel compliance checklist', () => {
  it('passes a clean computed panel and lists the standard topics', () => {
    const sys = computeSystem({
      id: 'P', name: 'T',
      panels: [panel({ id: 'mdp', name: 'MDP', circuits: [
        branch({ id: 'l', name: 'Lights', loadKind: 'lighting', isLighting: true, loadW: 2000 }),
        branch({ id: 's', name: 'Sockets', loadKind: 'socket', loadW: 3000 }),
      ] })],
    });
    const items = panelCompliance(sys.panels['mdp']!);
    const keys = items.map((i) => i.key);
    expect(keys).toContain('voltageDrop');
    expect(keys).toContain('breakingCapacity');
    expect(keys).toContain('ampacity');
    // A small, healthy board is not failing (the engine self-heals Vd/ampacity).
    expect(complianceStatus(items)).not.toBe('fail');
  });

  // The engine self-heals (it upsizes cables to meet Vd/ampacity), so the fail
  // paths are exercised against a hand-built result.
  it('rolls up fail / pass / na from the result fields', () => {
    const circuit = (over: Partial<CircuitResult>): CircuitResult =>
      ({
        circuitId: 'c', name: 'c', loadKind: 'general', designCurrentA: 10, phase: 'L1',
        breaker: { ratingA: 16, deviceClass: 'MCB', curve: 'C' },
        cable: { csaMm2: 2.5, baseKhaA: 24, deratedIzA: 24, deratingFactor: 1, appliedRule: '' },
        voltageDrop: { dropV: 1, dropPercent: 1, limitPercent: 3, withinLimit: true },
        grounding: { cores: 3, peCsaMm2: 2.5, cableSpec: 'NYM 3×2.5', cableType: 'NYM' },
        rcd: { required: false },
        ...over,
      }) as unknown as CircuitResult;

    const result = {
      circuits: [
        circuit({ voltageDrop: { dropV: 9, dropPercent: 9, limitPercent: 3, withinLimit: false } }),
        circuit({ disconnectsInTime: false }),
        circuit({ designCurrentA: 40, cable: { csaMm2: 2.5, baseKhaA: 24, deratedIzA: 24, deratingFactor: 1, appliedRule: '' } as CircuitResult['cable'] }),
      ],
      incomer: { kaAdequate: false },
      busbar: { withstand: { adequate: true } },
    } as unknown as PanelResult;

    const items = panelCompliance(result);
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('voltageDrop').status).toBe('fail');
    expect(by('ads').status).toBe('fail');
    expect(by('ampacity').status).toBe('fail');
    expect(by('breakingCapacity').status).toBe('fail');
    expect(by('busbarWithstand').status).toBe('pass');
    expect(by('protectiveConductor').status).toBe('na'); // no peAdiabaticOk set
    expect(complianceStatus(items)).toBe('fail');
  });

  it('ampacity also fails when the breaker exceeds the cable (In > Iz, under-protected)', () => {
    const circuit: CircuitResult = {
      circuitId: 'c', name: 'c', loadKind: 'general', designCurrentA: 10, phase: 'L1',
      breaker: { ratingA: 40, deviceClass: 'MCB', curve: 'C' }, // In 40 A
      cable: { csaMm2: 2.5, baseKhaA: 24, deratedIzA: 24, deratingFactor: 1, appliedRule: '' }, // Iz 24 A
      voltageDrop: { dropV: 1, dropPercent: 1, limitPercent: 3, withinLimit: true },
      grounding: { cores: 3, peCsaMm2: 2.5, cableSpec: 'NYM 3×2.5', cableType: 'NYM' },
      rcd: { required: false },
    } as unknown as CircuitResult;
    // Ib (10) ≤ Iz (24) so not overloaded, but In (40) > Iz (24): under-protected.
    const result = { circuits: [circuit], incomer: {}, busbar: {} } as unknown as PanelResult;
    expect(panelCompliance(result).find((i) => i.key === 'ampacity')!.status).toBe('fail');
  });
});
