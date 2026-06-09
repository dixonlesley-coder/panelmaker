/**
 * Standard demand-factor / diversity library by building occupancy, stamped with
 * STANDARDS_VERSION.
 *
 * Diversity (the fraction of the connected load expected simultaneously) and
 * per-load-kind demand factors vary strongly with how a building is used. These
 * presets give defensible typical values a designer can apply per panel instead
 * of guessing; explicit user-entered factors always override them.
 *
 * Values are typical engineering figures drawn from common practice and aligned
 * with the spirit of NEC Art. 220 / IEC 60364 demand-factor guidance:
 *   - residential: high lighting/socket diversity (rooms rarely all loaded).
 *   - office: moderate diversity; HVAC and sockets de-rated, lighting near full.
 *   - commercial/retail: lighting near continuous, sockets de-rated.
 *   - industrial: motors/process loads run close to continuous (low diversity).
 *   - hospitality: between office and residential; HVAC heavy.
 *   - mixed: a conservative blend.
 * They are estimates — verify against the actual load schedule and PUIL 2011.
 */

import type { LoadKind, OccupancyType } from '../types/electrical';

export type { OccupancyType };

export interface OccupancyPreset {
  label: string;
  /** Recommended panel diversity factor (fraction of connected load, 0-1). */
  diversityFactor: number;
  /** Per-load-kind demand-factor overrides (0-1); absent kinds keep their default. */
  demandFactors: Partial<Record<LoadKind, number>>;
  note: string;
}

/** The occupancy preset library: diversity + per-load-kind demand factors. */
export const OCCUPANCY_PRESETS: Readonly<Record<OccupancyType, OccupancyPreset>> = {
  residential: {
    label: 'Residential',
    diversityFactor: 0.6,
    demandFactors: { lighting: 0.66, socket: 0.5, general: 0.7 },
    note: 'High diversity — rooms and appliances are rarely all loaded together.',
  },
  office: {
    label: 'Office',
    diversityFactor: 0.75,
    demandFactors: { lighting: 0.9, socket: 0.6, hvac: 0.8, general: 0.8 },
    note: 'Lighting near continuous; sockets and HVAC de-rated for occupancy.',
  },
  commercial: {
    label: 'Commercial / retail',
    diversityFactor: 0.85,
    demandFactors: { lighting: 0.95, socket: 0.7, hvac: 0.9, general: 0.9 },
    note: 'Lighting effectively continuous in trading hours; moderate socket diversity.',
  },
  industrial: {
    label: 'Industrial',
    diversityFactor: 0.9,
    demandFactors: { motor: 0.85, pump: 0.85, hvac: 0.9, general: 0.9, welding: 0.6 },
    note: 'Process and motor loads run close to continuous — low diversity.',
  },
  hospitality: {
    label: 'Hospitality / hotel',
    diversityFactor: 0.7,
    demandFactors: { lighting: 0.8, socket: 0.55, hvac: 0.85, general: 0.75 },
    note: 'Guest rooms diversified; HVAC and common-area lighting heavy.',
  },
  mixed: {
    label: 'Mixed use',
    diversityFactor: 0.8,
    demandFactors: { lighting: 0.85, socket: 0.6, hvac: 0.85, general: 0.85 },
    note: 'Conservative blend for mixed-occupancy distribution.',
  },
};

/** Ordered occupancy types for UI pickers. */
export const OCCUPANCY_TYPES: readonly OccupancyType[] = [
  'residential',
  'office',
  'commercial',
  'industrial',
  'hospitality',
  'mixed',
];

/** Recommended panel diversity factor for an occupancy (undefined if unknown). */
export function recommendedDiversity(occupancy: OccupancyType): number {
  return OCCUPANCY_PRESETS[occupancy].diversityFactor;
}

/**
 * Recommended demand factor for a load kind under an occupancy, or `undefined`
 * when the preset does not override that kind (keep the load's own default).
 */
export function recommendedDemandFactor(
  occupancy: OccupancyType,
  kind: LoadKind,
): number | undefined {
  return OCCUPANCY_PRESETS[occupancy].demandFactors[kind];
}
