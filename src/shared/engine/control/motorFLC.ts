import { MOTOR_1PH_EFF_TIMES_PF, MOTOR_FLC_400V } from '../../standards/control/motor';

/**
 * Motor full-load current (A) for a given kW, interpolating the IEC 60034-1
 * standard table at 400 V and scaling inversely with voltage.
 */
export function motorFLC(kw: number, voltageV = 400): number {
  const table = MOTOR_FLC_400V;
  const first = table[0]!;
  const last = table[table.length - 1]!;

  let flc400: number;
  if (kw <= first.kw) {
    flc400 = first.flcA400;
  } else if (kw >= last.kw) {
    flc400 = last.flcA400;
  } else {
    flc400 = last.flcA400;
    for (let i = 0; i < table.length - 1; i++) {
      const lo = table[i]!;
      const hi = table[i + 1]!;
      if (kw >= lo.kw && kw <= hi.kw) {
        const t = (kw - lo.kw) / (hi.kw - lo.kw);
        flc400 = lo.flcA400 + t * (hi.flcA400 - lo.flcA400);
        break;
      }
    }
  }
  return flc400 * (400 / (voltageV > 0 ? voltageV : 400));
}

/**
 * Single-phase motor full-load current (A): I = P_shaft / (V · η·cosφ), with the
 * efficiency × power-factor product interpolated from typical 1-ph induction
 * motor data. Treating shaft kW as electrical input (P/V·cosφ) underestimates
 * the current by the motor's efficiency (~15-30% on small machines).
 */
export function motorFLC1ph(kw: number, voltageV = 230): number {
  const table = MOTOR_1PH_EFF_TIMES_PF;
  const first = table[0]!;
  const last = table[table.length - 1]!;

  let effPf: number;
  if (kw <= first.kw) {
    effPf = first.effPf;
  } else if (kw >= last.kw) {
    effPf = last.effPf;
  } else {
    effPf = last.effPf;
    for (let i = 0; i < table.length - 1; i++) {
      const lo = table[i]!;
      const hi = table[i + 1]!;
      if (kw >= lo.kw && kw <= hi.kw) {
        const t = (kw - lo.kw) / (hi.kw - lo.kw);
        effPf = lo.effPf + t * (hi.effPf - lo.effPf);
        break;
      }
    }
  }
  const v = voltageV > 0 ? voltageV : 230;
  return (kw * 1000) / (v * effPf);
}
