import { describe, it, expect } from 'vitest';
import { assessLightningRisk, collectionArea, computeSystem } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function panel(circuits: CircuitInput[]): PanelInput {
  return {
    id: 'mdp', name: 'MDP', system: '3ph', voltageV: 400, ambientTempC: 30,
    installMethod: 'conduit', groupingCount: 1, diversityFactor: 1, sourceType: 'utility', circuits,
  };
}
const load: CircuitInput = { id: 'c1', name: 'L', role: 'branch', loadW: 5000, cosPhi: 0.85, lengthM: 20, loadKind: 'general', isLighting: false, demandFactor: 1 };

describe('IEC 62305 lightning risk', () => {
  it('collection area follows L·W + 2·3H·(L+W) + π·(3H)²', () => {
    // 10×10×10: 100 + 2·30·20 + π·900 = 100 + 1200 + 2827.4 = 4127.4
    expect(collectionArea(10, 10, 10)).toBeCloseTo(4127.4, 0);
  });

  it('returns undefined without building dimensions', () => {
    expect(assessLightningRisk(undefined)).toBeUndefined();
    expect(assessLightningRisk({ buildingLengthM: 10 })).toBeUndefined();
  });

  it('flags an LPS for a large/tall building at high flash density', () => {
    const r = assessLightningRisk({ buildingLengthM: 80, buildingWidthM: 40, buildingHeightM: 40 })!;
    expect(r.eventsPerYear).toBeGreaterThan(r.tolerablePerYear);
    expect(r.lpsRequired).toBe(true);
    expect(['I', 'II', 'III', 'IV']).toContain(r.level);
    expect(r.note).toMatch(/LPS|level/i);
  });

  it('no LPS for a tiny, low-exposure structure', () => {
    // 4×3×2.5 at Ng 2 → Nd ≈ 0.0006/yr, below the 1e-3 tolerable.
    const r = assessLightningRisk({ buildingLengthM: 4, buildingWidthM: 3, buildingHeightM: 2.5, groundFlashDensity: 2 })!;
    expect(r.lpsRequired).toBe(false);
    expect(r.level).toBeNull();
  });

  it('computeSystem surfaces the risk and a required LPS forces a Type 1 SPD', () => {
    const project: ProjectInput = {
      id: 'P', name: 'B',
      site: { buildingLengthM: 80, buildingWidthM: 40, buildingHeightM: 40 },
      panels: [panel([load])],
    };
    const sys = computeSystem(project);
    expect(sys.lightningRisk?.lpsRequired).toBe(true);
    expect(sys.spd?.type).toMatch(/Type 1/); // LPS requirement → Type 1(+2) at origin
  });
});
