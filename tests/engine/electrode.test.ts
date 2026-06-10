import { describe, it, expect } from 'vitest';
import { designElectrode, singleRodResistance } from '@shared/engine/electrode';

describe('designElectrode — single rod', () => {
  it('gives a sensible single-rod resistance (~30 Ω order) for a 3 m / 16 mm rod in 100 Ω·m loam', () => {
    const r = designElectrode({ soilResistivityOhmM: 100 });
    expect(r.rodLengthM).toBe(3);
    expect(r.rodDiameterMm).toBe(16);
    // Dwight formula ≈ 33.5 Ω — assert a generous band around it.
    expect(r.singleRodOhm).toBeGreaterThan(25);
    expect(r.singleRodOhm).toBeLessThan(45);
  });

  it('resistance scales ~linearly with soil resistivity ρ', () => {
    const a = singleRodResistance(100, 3, 16);
    const b = singleRodResistance(300, 3, 16);
    // Tripling ρ triples R (the log term is ρ-independent).
    expect(b / a).toBeCloseTo(3, 5);
  });
});

describe('designElectrode — rod count vs soil', () => {
  it('very-low-resistivity (saturated) soil meets the target with one rod', () => {
    // A single 3 m rod hits 5 Ω only in very conductive ground (ρ ≈ ≤ 13 Ω·m).
    const r = designElectrode({ soilResistivityOhmM: 10 });
    expect(r.rodCount).toBe(1);
    expect(r.meetsTarget).toBe(true);
    expect(r.achievedOhm).toBeLessThanOrEqual(5);
  });

  it('high-resistivity soil needs multiple rods', () => {
    const r = designElectrode({ soilResistivityOhmM: 1000 }); // gravel
    expect(r.rodCount).toBeGreaterThan(1);
  });

  it('higher resistivity never needs fewer rods than lower resistivity', () => {
    const lo = designElectrode({ soilResistivityOhmM: 100 });
    const hi = designElectrode({ soilResistivityOhmM: 500 });
    expect(hi.rodCount).toBeGreaterThanOrEqual(lo.rodCount);
  });
});

describe('designElectrode — target compliance', () => {
  it('achievedOhm is at or below the target (default 5 Ω) whenever meetsTarget is true', () => {
    for (const rho of [30, 50, 100, 150, 500, 1000, 3000]) {
      const r = designElectrode({ soilResistivityOhmM: rho });
      if (r.meetsTarget) {
        expect(r.achievedOhm).toBeLessThanOrEqual(5);
      }
    }
  });

  it('respects a custom (stricter) target by adding rods', () => {
    const lenient = designElectrode({ soilResistivityOhmM: 100, targetOhm: 5 });
    const strict = designElectrode({ soilResistivityOhmM: 100, targetOhm: 2 });
    expect(strict.rodCount).toBeGreaterThan(lenient.rodCount);
  });

  it('produces a layout note and a clause reference', () => {
    const r = designElectrode({ soilResistivityOhmM: 500 });
    expect(r.note.length).toBeGreaterThan(0);
    expect(r.note).toContain('Ω');
    expect(r.clause).toContain('PUIL 2011');
  });
});
