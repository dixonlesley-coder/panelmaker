import { describe, it, expect } from 'vitest';
import {
  nextLargerSection,
  smallestSectionForIz,
  suggestCableUpsize,
  suggestContactorUpsize,
  computePanel,
} from '@shared/engine';
import type { PanelInput } from '@shared/types';

describe('recommendation helpers', () => {
  it('finds the next standard section', () => {
    expect(nextLargerSection(2.5)).toBe(4);
    expect(nextLargerSection(6)).toBe(10);
  });
  it('finds the smallest section for a required Iz', () => {
    expect(smallestSectionForIz(50, 1, 2.5)).toBe(10);
    expect(smallestSectionForIz(50, 0.7, 2.5)).toBe(16);
  });
  it('suggests a cable upsize that satisfies the requirement', () => {
    const fix = suggestCableUpsize(6, 50, 1, 2.5);
    expect(fix?.action?.payload.csaMm2).toBe(10);
  });
  it('suggests a contactor frame covering a target current', () => {
    const fix = suggestContactorUpsize(60);
    expect(fix?.action?.payload.ac3A).toBe(65);
  });
});

describe('warnings + suggestions surface on a panel', () => {
  it('flags an excessive voltage drop with a fix', () => {
    const p: PanelInput = {
      id: 'P',
      name: 'Far load',
      system: '3ph',
      voltageV: 400,
      ambientTempC: 30,
      installMethod: 'conduit',
      groupingCount: 1,
      diversityFactor: 0.8,
      sourceType: 'utility',
      circuits: [
        {
          id: 'c1',
          name: 'Distant motor',
          role: 'branch',
          loadW: 25000,
          cosPhi: 0.85,
          lengthM: 250,
          loadKind: 'general',
          isLighting: false,
          demandFactor: 1,
        },
      ],
    };
    const r = computePanel(p);
    const vd = r.warnings.find((w) => w.code === 'voltage-drop-exceeded');
    expect(vd).toBeDefined();
    expect(vd?.fixes?.length).toBeGreaterThan(0);
  });
});
