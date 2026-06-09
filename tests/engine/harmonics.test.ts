import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem, isNonLinear } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function branch(p: Partial<CircuitInput> & { id: string; name: string }): CircuitInput {
  return {
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'general',
    isLighting: false,
    demandFactor: 1,
    ...p,
  };
}

function panel(p: Partial<PanelInput> & { id: string; name: string }): PanelInput {
  return {
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits: [],
    ...p,
  };
}

describe('isNonLinear', () => {
  it('counts VFD/soft-starter drives, UPS and welding; not DOL motors or lighting', () => {
    expect(isNonLinear('motor', 'VFD')).toBe(true);
    expect(isNonLinear('pump', 'SOFT_STARTER')).toBe(true);
    expect(isNonLinear('ups')).toBe(true);
    expect(isNonLinear('welding')).toBe(true);
    expect(isNonLinear('motor', 'DOL')).toBe(false);
    expect(isNonLinear('lighting')).toBe(false);
    expect(isNonLinear('general')).toBe(false);
  });
});

describe('computeHarmonics via computePanel', () => {
  it('reports nothing when there are no non-linear loads', () => {
    const r = computePanel(
      panel({
        id: 'P',
        name: 'Linear DB',
        circuits: [
          branch({ id: 'l', name: 'Lighting', loadKind: 'lighting', loadW: 4000, isLighting: true }),
          branch({ id: 'm', name: 'DOL motor', loadKind: 'motor', motorKw: 11, starterType: 'DOL' }),
        ],
      }),
    );
    expect(r.harmonics).toBeUndefined();
    expect(r.warnings.some((w) => w.code.startsWith('harmonics'))).toBe(false);
  });

  it('recommends a line reactor for a VFD-heavy three-phase panel', () => {
    const r = computePanel(
      panel({
        id: 'P',
        name: 'VFD DB',
        circuits: [
          branch({ id: 'v1', name: 'VFD pump 1', loadKind: 'pump', motorKw: 30, starterType: 'VFD' }),
          branch({ id: 'v2', name: 'VFD pump 2', loadKind: 'pump', motorKw: 30, starterType: 'VFD' }),
          branch({ id: 'lt', name: 'Lighting', loadKind: 'lighting', loadW: 3000, isLighting: true }),
        ],
      }),
    );
    expect(r.harmonics).toBeDefined();
    const h = r.harmonics!;
    expect(h.nonLinearFraction).toBeGreaterThan(0.35);
    expect(h.reactorRecommended).toBe(true);
    expect(h.reactorPctZ).toBeGreaterThan(0);
    expect(h.thdBand).toBe('high');
    expect(r.warnings.some((w) => w.code === 'harmonics-mitigation')).toBe(true);
  });

  it('recommends an oversized neutral when single-phase non-linear load dominates', () => {
    const r = computePanel(
      panel({
        id: 'P',
        name: 'UPS DB',
        circuits: [
          // Single-phase UPS loads dominate -> triplen neutral content.
          branch({ id: 'u1', name: 'UPS A', loadKind: 'ups', loadW: 4000 }),
          branch({ id: 'u2', name: 'UPS B', loadKind: 'ups', loadW: 4000 }),
          branch({ id: 'u3', name: 'UPS C', loadKind: 'ups', loadW: 4000 }),
          branch({ id: 'g', name: 'General', loadKind: 'general', loadW: 2000 }),
        ],
      }),
    );
    expect(r.harmonics).toBeDefined();
    const h = r.harmonics!;
    expect(h.neutralOversizeFactor).toBeGreaterThan(1);
    expect(h.recommendedNeutralCsaMm2).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.code === 'harmonics-neutral-oversize')).toBe(true);
  });

  it('surfaces the harmonics estimate through computeSystem', () => {
    const project: ProjectInput = {
      id: 'PRJ',
      name: 'B',
      panels: [
        panel({
          id: 'MAIN',
          name: 'Main',
          circuits: [
            branch({ id: 'v', name: 'Big VFD', loadKind: 'motor', motorKw: 55, starterType: 'VFD' }),
            branch({ id: 'lt', name: 'Lighting', loadKind: 'lighting', loadW: 2000, isLighting: true }),
          ],
        }),
      ],
    };
    const sys = computeSystem(project);
    expect(sys.panels['MAIN']!.harmonics).toBeDefined();
    expect(sys.warnings.some((w) => w.code.startsWith('harmonics'))).toBe(true);
  });
});
