import { describe, it, expect } from 'vitest';
import { computePanel, sizeGrounding } from '@shared/engine';
import { circuitOrderCodes } from '@shared/engine/bom';
import { CATALOG_PARTS } from '@shared/data/catalog';
import type { CircuitInput, PanelInput, Part } from '@shared/types';

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

const parts: Part[] = [...CATALOG_PARTS];

describe('per-circuit cable type', () => {
  it('sizeGrounding reports the effective construction (default and explicit)', () => {
    const auto1ph = sizeGrounding({ phaseCsaMm2: 2.5, panelSystem: '3ph', threePhase: false });
    expect(auto1ph.cableType).toBe('NYM');
    expect(auto1ph.cableSpec.startsWith('NYM ')).toBe(true);

    const auto3ph = sizeGrounding({ phaseCsaMm2: 16, panelSystem: '3ph', threePhase: true });
    expect(auto3ph.cableType).toBe('NYY');

    const explicit = sizeGrounding({
      phaseCsaMm2: 2.5,
      panelSystem: '3ph',
      threePhase: false,
      cableType: 'NYA',
    });
    expect(explicit.cableType).toBe('NYA');
    expect(explicit.cableSpec.startsWith('NYA ')).toBe(true);
  });

  it('computePanel: an explicit circuit cableType wins; siblings keep the default', () => {
    const p = panel({
      id: 'P1',
      name: 'DB',
      circuits: [
        branch({ id: 'c1', name: 'Conduit wiring', loadW: 2000, cableType: 'NYA' }),
        branch({ id: 'c2', name: 'Sockets', loadW: 3000 }),
      ],
    });
    const r = computePanel(p);
    const chosen = r.circuits.find((c) => c.circuitId === 'c1')!;
    const auto = r.circuits.find((c) => c.circuitId === 'c2')!;
    expect(chosen.grounding.cableType).toBe('NYA');
    expect(chosen.grounding.cableSpec.startsWith('NYA ')).toBe(true);
    expect(auto.grounding.cableType).toBe('NYM'); // 1ph default
  });

  it('explicit type beats the panel XLPE/aluminum derivation', () => {
    const p = panel({
      id: 'P2',
      name: 'XLPE DB',
      insulation: 'XLPE',
      circuits: [
        branch({ id: 'c1', name: 'Pinned NYY', loadW: 9000, cableType: 'NYY' }),
        branch({ id: 'c2', name: 'Auto XLPE', loadW: 9000 }),
      ],
    });
    const r = computePanel(p);
    expect(r.circuits.find((c) => c.circuitId === 'c1')!.grounding.cableType).toBe('NYY');
    expect(r.circuits.find((c) => c.circuitId === 'c2')!.grounding.cableType).toBe('N2XY');
  });

  it('order codes match the chosen construction in the catalog', () => {
    const p = panel({
      id: 'P3',
      name: 'DB',
      circuits: [
        branch({ id: 'c1', name: 'Lighting', loadW: 1500, loadKind: 'lighting', isLighting: true, cableType: 'NYA' }),
        branch({ id: 'c2', name: 'Lighting auto', loadW: 1500, loadKind: 'lighting', isLighting: true }),
      ],
    });
    const r = computePanel(p);
    const chosen = circuitOrderCodes(r.circuits.find((c) => c.circuitId === 'c1')!, parts);
    const auto = circuitOrderCodes(r.circuits.find((c) => c.circuitId === 'c2')!, parts);
    expect(chosen.cable).toMatch(/^NYA-/);
    expect(auto.cable).toMatch(/^NYM-/);
  });

  it('falls back to section-only matching when the catalog lacks the type', () => {
    const noNya = parts.filter((pt) => pt.attributes.type !== 'NYA');
    const p = panel({
      id: 'P4',
      name: 'DB',
      circuits: [
        branch({ id: 'c1', name: 'Lighting', loadW: 1500, loadKind: 'lighting', isLighting: true, cableType: 'NYA' }),
      ],
    });
    const r = computePanel(p);
    const codes = circuitOrderCodes(r.circuits[0]!, noNya);
    // Still matched — just not an NYA part, since none exists in this catalog.
    expect(codes.cable).toBeDefined();
    expect(codes.cable).not.toMatch(/^NYA-/);
  });
});
