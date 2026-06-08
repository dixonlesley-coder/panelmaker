import { hourlyFactors } from '../standards/schedule';
import type { CircuitInput, ProjectInput } from '../types/project';
import type { LoadProfileResult } from '../types/results';
import { round } from './util';

/** A circuit's peak demand (kW): motor kW for motors, else connected kW, x demand factor. */
function circuitDemandKw(c: CircuitInput): number {
  const base =
    (c.loadKind === 'motor' || c.loadKind === 'pump') && c.motorKw !== undefined
      ? c.motorKw
      : c.loadW / 1000;
  return base * (c.demandFactor ?? 1);
}

/**
 * Build the 24-hour building load profile from each leaf load's schedule and find
 * the peak (when and how big) plus the circuits driving it (where). Feeder
 * circuits are skipped so sub-panel loads are counted once, at the leaf.
 */
export function computeLoadProfile(project: ProjectInput): LoadProfileResult {
  const hourly = new Array<number>(24).fill(0);
  const byPanel: LoadProfileResult['byPanel'] = [];
  const contributors: { circuitId: string; name: string; panelName: string; hourly: number[] }[] = [];

  for (const panel of project.panels) {
    const panelHourly = new Array<number>(24).fill(0);
    for (const c of panel.circuits) {
      if (c.role !== 'branch' || c.feedsPanelId) continue; // skip feeders (counted at the leaf)
      const kw = circuitDemandKw(c);
      const factors = hourlyFactors(c.schedule);
      const ch = factors.map((x) => x * kw);
      for (let h = 0; h < 24; h++) {
        panelHourly[h]! += ch[h]!;
        hourly[h]! += ch[h]!;
      }
      contributors.push({ circuitId: c.id, name: c.name, panelName: panel.name, hourly: ch });
    }
    byPanel.push({ panelId: panel.id, name: panel.name, hourlyKw: panelHourly.map((x) => round(x, 2)) });
  }

  let peakKw = 0;
  let peakHour = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h]! > peakKw) {
      peakKw = hourly[h]!;
      peakHour = h;
    }
  }

  const dailyKwh = hourly.reduce((s, x) => s + x, 0); // each hour spans 1 h
  const loadFactor = peakKw > 0 ? dailyKwh / 24 / peakKw : 0;

  const peakContributors = contributors
    .map((c) => ({ circuitId: c.circuitId, name: c.name, panelName: c.panelName, kw: round(c.hourly[peakHour]!, 2) }))
    .filter((c) => c.kw > 0)
    .sort((a, b) => b.kw - a.kw)
    .slice(0, 8);

  return {
    hourlyKw: hourly.map((x) => round(x, 2)),
    peakKw: round(peakKw, 2),
    peakHour,
    dailyKwh: round(dailyKwh, 1),
    loadFactor: round(loadFactor, 2),
    byPanel,
    peakContributors,
  };
}
