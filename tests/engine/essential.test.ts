import { describe, it, expect } from 'vitest';
import { computeSystem, computePowerOneline } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput, SourcesConfig } from '@shared/types';

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

/** MDP (100 kW general) feeding a small essential sub-panel (10 kW + a pump). */
function hybridProject(opts: {
  essential?: boolean;
  sources?: SourcesConfig;
  childEssentialToo?: boolean;
}): ProjectInput {
  return {
    id: 'prj',
    name: 'Hybrid',
    sources: opts.sources,
    panels: [
      panel({
        id: 'mdp',
        name: 'MDP',
        ...(opts.childEssentialToo ? { essential: true } : {}),
        circuits: [
          branch({ id: 'big', name: 'Big load', loadW: 100000 }),
          branch({ id: 'f1', name: 'Feeder → EP', loadKind: 'feeder', feedsPanelId: 'ep' }),
        ],
      }),
      panel({
        id: 'ep',
        name: 'Essential panel',
        sourceType: 'feeder',
        fedByCircuitId: 'f1',
        ...(opts.essential ? { essential: true } : {}),
        circuits: [
          branch({ id: 'l1', name: 'Emergency lighting', loadW: 4000, loadKind: 'lighting', isLighting: true }),
          branch({ id: 'p1', name: 'Fire pump', loadKind: 'pump', motorKw: 5.5, starterType: 'DOL' }),
        ],
      }),
    ],
  };
}

const GEN: SourcesConfig = { generator: { enabled: true, backupFraction: 1, mode: 'standby' } };

describe('essential (genset-backed) panels', () => {
  it('genset sizes from the essential panels, not the blanket fraction', () => {
    const blanket = computeSystem(hybridProject({ sources: GEN }));
    const essential = computeSystem(hybridProject({ essential: true, sources: GEN }));
    // Backing only the 10-ish kW essential panel needs a far smaller set than
    // backing 100% of a ~110 kW building.
    expect(essential.sources?.generator?.ratingKva).toBeLessThan(
      blanket.sources?.generator?.ratingKva ?? 0,
    );
    expect(essential.sources?.generator?.essentialPanelCount).toBe(1);
    expect(blanket.sources?.generator?.essentialPanelCount).toBeUndefined();
    expect(essential.sources?.generator?.note).toContain('essential');
  });

  it('a panel under an essential ancestor is not double-counted', () => {
    // Marking BOTH the MDP and its sub-panel must equal marking the MDP alone.
    const both = computeSystem(hybridProject({ essential: true, childEssentialToo: true, sources: GEN }));
    const mdpOnly = computeSystem(hybridProject({ childEssentialToo: true, sources: GEN }));
    expect(both.sources?.generator?.backupKva).toBe(mdpOnly.sources?.generator?.backupKva);
  });

  it('genset motor-start assessment covers only the essential subtree', () => {
    const r = computeSystem(hybridProject({ essential: true, sources: GEN }));
    const motors = r.sources?.gensetStart?.worst;
    // The fire pump (essential) is assessed; nothing from the non-essential MDP is.
    expect(r.sources?.gensetStart).toBeDefined();
    expect(JSON.stringify(motors ?? r.sources?.gensetStart)).toContain('Fire pump');
  });

  it('warns when essential panels exist but no backup source does', () => {
    const r = computeSystem(hybridProject({ essential: true }));
    expect(r.warnings.some((w) => w.code === 'essential-no-backup')).toBe(true);
    const ok = computeSystem(hybridProject({ essential: true, sources: GEN }));
    expect(ok.warnings.some((w) => w.code === 'essential-no-backup')).toBe(false);
  });

  it('splits an essential bus on the power one-line and backs the battery onto it', () => {
    const r = computeSystem(
      hybridProject({
        essential: true,
        sources: {
          ...GEN,
          battery: { enabled: true, backupKw: 5, autonomyHours: 2, chemistry: 'lifepo4' },
        },
      }),
    );
    const ol = computePowerOneline(r);
    const essBus = ol.nodes.find((n) => n.id === 'ess-bus');
    expect(essBus).toBeDefined();
    expect(essBus!.label).toBe('Essential bus');
    // ATS feeds the essential bus; the battery inverter connects there too.
    expect(ol.edges.some((e) => e.from === 'ats' && e.to === 'ess-bus')).toBe(true);
    expect(ol.edges.some((e) => e.from === 'battinv' && e.to === 'ess-bus')).toBe(true);
    // No essential marked → no split (whole-building ATS), battery on main bus.
    const flat = computePowerOneline(computeSystem(hybridProject({ sources: GEN })));
    expect(flat.nodes.some((n) => n.id === 'ess-bus')).toBe(false);
    expect(flat.edges.some((e) => e.from === 'ats' && e.to === 'bus')).toBe(true);
  });
});

describe('hybrid PV rules', () => {
  it('adds the genset-PV interlock when both exist', () => {
    const r = computeSystem(
      hybridProject({
        sources: { ...GEN, solar: { enabled: true, targetKwp: 20, panelWp: 550, dcAcRatio: 1.2 } },
      }),
    );
    const ol = computePowerOneline(r);
    expect(ol.interlocks.some((il) => il.id === 'il-pv-gen')).toBe(true);
  });

  it('warns when the PV inverter exceeds the PLN connected power', () => {
    // ~110 kW building, but a 400 kWp array → inverter far above the service.
    const r = computeSystem(
      hybridProject({
        sources: { solar: { enabled: true, targetKwp: 400, panelWp: 550, dcAcRatio: 1.2 } },
      }),
    );
    expect(r.warnings.some((w) => w.code === 'pv-exceeds-service')).toBe(true);
    const small = computeSystem(
      hybridProject({
        sources: { solar: { enabled: true, targetKwp: 10, panelWp: 550, dcAcRatio: 1.2 } },
      }),
    );
    expect(small.warnings.some((w) => w.code === 'pv-exceeds-service')).toBe(false);
  });
});
