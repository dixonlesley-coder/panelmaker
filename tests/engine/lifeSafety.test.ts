import { describe, it, expect } from 'vitest';
import { computePanel, computeSystem } from '@shared/engine';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

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

const firePump = (id = 'fp'): CircuitInput =>
  branch({ id, name: 'Fire pump', loadKind: 'pump', motorKw: 15, starterType: 'DOL', startingDuty: 'heavy', lifeSafety: true });

describe('life-safety circuits', () => {
  it('gets NO RCD even on a TT system (availability prevails)', () => {
    const p = panel({ id: 'P1', name: 'Fire panel', circuits: [firePump(), branch({ id: 's1', name: 'Sockets', loadW: 2000, loadKind: 'socket' })] });
    const r = computePanel(p, { earthingSystem: 'TT' });
    const fp = r.circuits.find((c) => c.circuitId === 'fp')!;
    const sock = r.circuits.find((c) => c.circuitId === 's1')!;
    expect(fp.lifeSafety).toBe(true);
    expect(fp.rcd.required).toBe(false);
    expect(fp.rcd.reason).toContain('Life-safety');
    expect(sock.rcd.required).toBe(true); // ordinary TT final circuit keeps its RCD
  });

  it('defaults to fire-resistant FRC cable; explicit choice still wins (with a warning)', () => {
    const p = panel({ id: 'P2', name: 'Fire panel', circuits: [firePump()] });
    const r = computePanel(p);
    expect(r.circuits[0]!.grounding.cableType).toBe('FRC');
    expect(r.circuits[0]!.grounding.cableSpec).toContain('FRC');

    const pinned = panel({ id: 'P3', name: 'Fire panel', circuits: [{ ...firePump(), cableType: 'NYY' }] });
    const r2 = computePanel(pinned);
    expect(r2.circuits[0]!.grounding.cableType).toBe('NYY');
    expect(r2.warnings.some((w) => w.code === 'life-safety-cable')).toBe(true);
  });

  it('warns when no generator backs life-safety circuits', () => {
    const prj: ProjectInput = { id: 'x', name: 'X', panels: [panel({ id: 'P', name: 'Fire panel', circuits: [firePump()] })] };
    expect(computeSystem(prj).warnings.some((w) => w.code === 'life-safety-no-backup')).toBe(true);
    const withGen: ProjectInput = {
      ...prj,
      sources: { generator: { enabled: true, backupFraction: 1, mode: 'standby' } },
    };
    expect(computeSystem(withGen).warnings.some((w) => w.code === 'life-safety-no-backup')).toBe(false);
  });

  it('warns when a life-safety circuit sits outside the essential bus', () => {
    const prj: ProjectInput = {
      id: 'x',
      name: 'X',
      sources: { generator: { enabled: true, backupFraction: 1, mode: 'standby' } },
      panels: [
        panel({ id: 'ess', name: 'Essential panel', essential: true, circuits: [branch({ id: 'l', name: 'Em. lighting', loadW: 2000, loadKind: 'lighting', isLighting: true, lifeSafety: true })] }),
        panel({ id: 'other', name: 'Other panel', circuits: [firePump()] }),
      ],
    };
    const r = computeSystem(prj);
    const w = r.warnings.find((x) => x.code === 'life-safety-not-backed');
    expect(w).toBeDefined();
    expect(w!.panelId).toBe('other'); // the essential panel's circuit is fine
  });
});
