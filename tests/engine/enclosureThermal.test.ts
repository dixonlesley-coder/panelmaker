import { describe, it, expect } from 'vitest';
import { verifyEnclosureThermal } from '@shared/engine/enclosureThermal';
import {
  effectiveAreaM2,
  recommendIp,
  MAX_INTERNAL_TEMP_RISE_K,
} from '@shared/standards/enclosureThermal';

describe('verifyEnclosureThermal — temperature rise', () => {
  it('flags a small enclosure with high heat as exceeding the 35 K rise', () => {
    const r = verifyEnclosureThermal({
      widthMm: 300,
      heightMm: 400,
      depthMm: 200,
      totalHeatW: 400,
      mounting: 'wall',
    });
    expect(r.tempRiseK).toBeGreaterThan(MAX_INTERNAL_TEMP_RISE_K);
    expect(r.withinLimit).toBe(false);
    expect(r.ventilationRecommended).toBe(true);
  });

  it('passes a large enclosure with modest heat as within the limit', () => {
    const r = verifyEnclosureThermal({
      widthMm: 1000,
      heightMm: 2000,
      depthMm: 600,
      totalHeatW: 150,
      mounting: 'free-standing',
    });
    expect(r.tempRiseK).toBeLessThanOrEqual(MAX_INTERNAL_TEMP_RISE_K);
    expect(r.withinLimit).toBe(true);
    expect(r.ventilationRecommended).toBe(false);
  });

  it('lowers the temperature rise when forced ventilation is fitted', () => {
    const dims = { widthMm: 400, heightMm: 600, depthMm: 250, totalHeatW: 500 } as const;
    const natural = verifyEnclosureThermal({ ...dims, forcedVentilation: false });
    const forced = verifyEnclosureThermal({ ...dims, forcedVentilation: true });
    expect(forced.tempRiseK).toBeLessThan(natural.tempRiseK);
    // forced ventilation can resolve the over-limit case (never recommends more vents)
    expect(forced.ventilationRecommended).toBe(false);
  });

  it('computes internalTempC as ambient + tempRiseK', () => {
    const ambientC = 40;
    const r = verifyEnclosureThermal({
      widthMm: 500,
      heightMm: 700,
      depthMm: 250,
      totalHeatW: 300,
      ambientC,
    });
    expect(r.internalTempC).toBeCloseTo(ambientC + r.tempRiseK, 1);
  });

  it('defaults the ambient to 35 °C (Indonesian) when none is supplied', () => {
    const r = verifyEnclosureThermal({
      widthMm: 600,
      heightMm: 800,
      depthMm: 300,
      totalHeatW: 100,
    });
    expect(r.internalTempC).toBeCloseTo(35 + r.tempRiseK, 1);
  });
});

describe('verifyEnclosureThermal — IP recommendation', () => {
  it('recommends IP65 outdoors', () => {
    const r = verifyEnclosureThermal({
      widthMm: 600,
      heightMm: 800,
      depthMm: 300,
      totalHeatW: 100,
      environment: 'outdoor',
    });
    expect(r.ip.code).toBe('IP65');
  });

  it('recommends an indoor IP31/IP41-class code indoors', () => {
    const r = verifyEnclosureThermal({
      widthMm: 600,
      heightMm: 800,
      depthMm: 300,
      totalHeatW: 100,
      environment: 'indoor',
    });
    expect(['IP31', 'IP41']).toContain(r.ip.code);
  });
});

describe('effectiveAreaM2 — mounting surface factors', () => {
  it('wall and free-standing both lose one face but stay positive and below the full 6-face area', () => {
    const w = 800;
    const h = 1000;
    const d = 400;
    const wM = w / 1000;
    const hM = h / 1000;
    const dM = d / 1000;
    const fullSixFace = 2 * (wM * hM + wM * dM + hM * dM);

    const wall = effectiveAreaM2(w, h, d, 'wall');
    const free = effectiveAreaM2(w, h, d, 'free-standing');

    expect(wall).toBeGreaterThan(0);
    expect(free).toBeGreaterThan(0);
    expect(wall).toBeLessThan(fullSixFace);
    expect(free).toBeLessThan(fullSixFace);
    // wall removes the back face (w·h), free-standing removes the bottom (w·d)
    expect(wall).toBeCloseTo(fullSixFace - wM * hM, 6);
    expect(free).toBeCloseTo(fullSixFace - wM * dM, 6);
  });
});

describe('recommendIp', () => {
  it('maps each environment to a sensible IP code', () => {
    expect(recommendIp('indoor_dusty').code).toBe('IP54');
    expect(recommendIp('washdown').code).toBe('IP65');
  });
});
