import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem } from '@shared/engine';
import { buildPanelBom, buildSystemBom } from '@shared/engine/bom';
import { CATALOG_PARTS } from '@shared/data/catalog';
import type { CircuitInput, PanelInput, Part, ProjectInput } from '@shared/types';

const parts: Part[] = [...CATALOG_PARTS];

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

describe('earthing conductors in the BOM', () => {
  it('NYA conduit wiring lists separate conductors with a G/Y PE at the PE size', () => {
    // A feeder-sized 3φ load on NYA single-core wiring: lives+N at the phase
    // size, the PE as its OWN green-yellow conductor at the reduced size.
    const p = panel({
      id: 'P1',
      name: 'Conduit DB',
      circuits: [branch({ id: 'c1', name: 'Big 3φ', loadW: 30000, cableType: 'NYA' })],
    });
    const r = computePanel(p);
    const c = r.circuits[0]!;
    expect(c.grounding.cableType).toBe('NYA');
    const cableLines = buildPanelBom(r, parts).filter((l) => l.category === 'cable');
    expect(cableLines).toHaveLength(2);
    const phases = cableLines.find((l) => l.description.includes('(L/N)'))!;
    const pe = cableLines.find((l) => l.description.includes('G/Y (PE)'))!;
    expect(phases.qty).toBe(c.grounding.cores - 1); // lives + neutral
    expect(phases.sku).toMatch(/^NYA-/);
    expect(pe.qty).toBe(1);
    expect(pe.sku).toMatch(/^NYA-/);
    expect(pe.description).toContain(`${c.grounding.peCsaMm2} mm²`);
  });

  it('multicore cable stays ONE line with the integral PE in the make-up', () => {
    // Big enough (50 mm²) that the PE is reduced — the make-up shows it as the
    // grouped extra core ("4×50 + 25"), still ONE cable product.
    const p = panel({
      id: 'P2',
      name: 'NYY DB',
      circuits: [branch({ id: 'c1', name: 'Feeder-ish', loadW: 60000 })], // NYY default
    });
    const r = computePanel(p);
    const c = r.circuits[0]!;
    const cableLines = buildPanelBom(r, parts).filter((l) => l.category === 'cable');
    expect(cableLines).toHaveLength(1);
    expect(cableLines[0]!.description).toContain('Cable NYY');
    if (c.grounding.peCsaMm2 !== c.cable.csaMm2) {
      expect(cableLines[0]!.description).toContain(`+ ${c.grounding.peCsaMm2}`);
    }
  });

  it('system BOM carries the BC main earthing + bonding and the electrode rods', () => {
    const prj: ProjectInput = {
      id: 'prj',
      name: 'T',
      panels: [panel({ id: 'mdp', name: 'MDP', circuits: [branch({ id: 'c1', name: 'L', loadW: 20000 })] })],
    };
    const sys = computeSystem(prj);
    const lines = buildSystemBom(sys, parts);
    const main = lines.find((l) => l.description.startsWith('Main earthing conductor'))!;
    const bond = lines.find((l) => l.description.startsWith('Main equipotential bonding'))!;
    expect(main.sku).toMatch(/^BC-/); // bare copper, matched to the BC ladder
    expect(bond.sku).toMatch(/^BC-/);
    expect(main.description).toContain(`${sys.earthing.mainEarthingConductorMm2} mm²`);
    const rods = lines.find((l) => l.description.startsWith('Earth electrode rod'))!;
    expect(rods.qty).toBe(sys.earthing.electrode!.rodCount);
  });
});
