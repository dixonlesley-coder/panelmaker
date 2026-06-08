import type { ControlAssembly } from '../types/control';
import type { CircuitResult, Warning } from '../types/results';
import { suggestCableUpsize, suggestCableForVoltageDrop } from './recommendations';

export interface CircuitWarningContext {
  deratingFactor: number;
  minSectionMm2: number;
  panelId?: string;
}

/** Detect rule violations on a computed circuit, attaching suggested fixes. */
export function circuitWarnings(result: CircuitResult, ctx: CircuitWarningContext): Warning[] {
  const out: Warning[] = [];
  const { breaker, cable, voltageDrop: vd, circuitId, name } = result;
  const base = { panelId: ctx.panelId, circuitId };

  if (cable.appliedRule.startsWith('exceeds-range')) {
    out.push({
      code: 'cable-exceeds-range',
      severity: 'error',
      message: `${name}: no standard cable section satisfies the load; largest (${cable.csaMm2} mm²) used.`,
      ...base,
    });
  }

  if (breaker.ratingA > cable.deratedIzA + 1e-9) {
    const fix = suggestCableUpsize(cable.csaMm2, breaker.ratingA, ctx.deratingFactor, ctx.minSectionMm2);
    out.push({
      code: 'breaker-exceeds-cable',
      severity: 'error',
      message: `${name}: breaker ${breaker.ratingA} A exceeds cable ampacity Iz ${cable.deratedIzA} A — cable under-protected.`,
      fixes: fix ? [fix] : undefined,
      ...base,
    });
  }

  if (!vd.withinLimit) {
    const fix = suggestCableForVoltageDrop(cable.csaMm2, vd.dropPercent, vd.limitPercent);
    out.push({
      code: 'voltage-drop-exceeded',
      severity: 'warning',
      message: `${name}: voltage drop ${vd.dropPercent}% exceeds ${vd.limitPercent}% limit.`,
      fixes: fix ? [fix] : undefined,
      ...base,
    });
  }

  if (result.control) {
    for (const cw of result.control.warnings) {
      out.push({ code: 'control', severity: 'warning', message: `${name}: ${cw}`, ...base });
    }
  }

  return out;
}

const REQUIRED_INTERLOCKS: Readonly<Record<string, [string, string]>> = {
  STAR_DELTA: ['star-contactor', 'delta-contactor'],
  REVERSING: ['forward-contactor', 'reverse-contactor'],
  ATS: ['mains-contactor', 'genset-contactor'],
};

/** Ensure starter types that need a mutual-exclusion interlock actually have one. */
export function validateInterlocks(assembly: ControlAssembly, panelId?: string): Warning[] {
  const req = REQUIRED_INTERLOCKS[assembly.starterType];
  if (!req) return [];
  const [ra, rb] = req;
  const idA = `${assembly.circuitId}:${ra}`;
  const idB = `${assembly.circuitId}:${rb}`;
  const present = assembly.interlocks.some(
    (il) =>
      il.relation === 'mutual_exclusion' &&
      ((il.deviceAId === idA && il.deviceBId === idB) ||
        (il.deviceAId === idB && il.deviceBId === idA)),
  );
  if (!present) {
    return [
      {
        code: 'missing-interlock',
        severity: 'error',
        message: `${assembly.starterType} requires a ${ra} ↔ ${rb} interlock.`,
        panelId,
        circuitId: assembly.circuitId,
      },
    ];
  }
  return [];
}
