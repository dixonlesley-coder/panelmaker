import { STARTING_PROFILES } from '../../standards/control/starting';
import type { StarterType, StartingAnalysis } from '../../types/control';
import { round } from '../util';

/**
 * Starting current/torque for a motor under the chosen starting method, and a
 * note on the trade-off (inrush vs torque, soft-start, VSD energy saving).
 */
export function startingAnalysis(
  starterType: StarterType,
  flcA: number,
  variableTorque = false,
): StartingAnalysis {
  const p = STARTING_PROFILES[starterType] ?? STARTING_PROFILES.DOL;
  const startCurrentA = round(flcA * p.startMultiple, 0);

  let note = `${p.label}: starting current ~${p.startMultiple}× FLC (${startCurrentA} A), ~${p.startTorquePct}% starting torque.`;
  if (starterType === 'VFD') {
    note += variableTorque
      ? ' Variable-torque load — large energy saving at part speed (cube law).'
      : ' Full torque from standstill with minimal inrush.';
  } else if (starterType === 'SOFT_STARTER') {
    note += ' Smooth voltage ramp (adjustable ~2-4× FLC) reduces mechanical and electrical stress.';
  } else if (starterType === 'STAR_DELTA') {
    note += ' Inrush cut to ~1/3 of DOL, but only ~1/3 starting torque — not for high-inertia loads.';
  }

  return {
    method: p.label,
    startCurrentA,
    startCurrentMultiple: p.startMultiple,
    startTorquePct: p.startTorquePct,
    note,
  };
}
