/**
 * PLN service-connection + revenue-metering selection (pure).
 *
 * From the building's diversified demand: the PLN connected-power step (daya
 * tersambung) the installation must subscribe to, whether the kWh metering is
 * direct (whole-current) or CT-operated, and the CT ratio/class when needed.
 * Beyond the LV ceiling the service is MV (TM) with primary metering.
 */

import {
  CT_PRIMARY_A,
  DIRECT_METER_MAX_A,
  METERING_CT_CLASS,
  PLN_LV_MAX_VA,
  PLN_TARIFF_STEPS_VA,
} from '../standards/metering';
import type { SystemType } from '../types/electrical';
import { round } from './util';

export interface MeteringResult {
  /** Connected power to subscribe (VA) — the PLN step, or raw demand for MV. */
  serviceVa: number;
  /** Diversified building demand the step was chosen for (VA). */
  demandVa: number;
  /** Service current at the subscribed power (A). */
  serviceCurrentA: number;
  /** Whole-current meter, or CT-operated metering. */
  metering: 'direct' | 'ct';
  /** CT ratio, e.g. "300/5", when CT-operated. */
  ctRatio?: string;
  /** CT accuracy class for revenue metering. */
  ctClass?: string;
  /** True when demand exceeds the LV (TR) ceiling — MV (TM) service. */
  mvService: boolean;
  note: string;
}

/** Select the PLN service step, metering type and CT for a building demand. */
export function computeMetering(
  demandKva: number,
  lineVoltageV: number,
  system: SystemType,
): MeteringResult {
  const demandVa = Math.max(0, demandKva * 1000);
  const mvService = demandVa > PLN_LV_MAX_VA;
  const serviceVa = mvService
    ? Math.ceil(demandVa)
    : (PLN_TARIFF_STEPS_VA.find((s) => s >= demandVa) ?? PLN_LV_MAX_VA);

  const v = lineVoltageV > 0 ? lineVoltageV : system === '3ph' ? 400 : 230;
  const serviceCurrentA = system === '3ph' ? serviceVa / (Math.sqrt(3) * v) : serviceVa / v;

  const direct = !mvService && serviceCurrentA <= DIRECT_METER_MAX_A;
  let ctRatio: string | undefined;
  if (!direct) {
    const primary = CT_PRIMARY_A.find((p) => p >= serviceCurrentA) ?? CT_PRIMARY_A[CT_PRIMARY_A.length - 1]!;
    ctRatio = `${primary}/5`;
  }

  const note = mvService
    ? `Demand ${round(demandVa / 1000, 1)} kVA exceeds the ${PLN_LV_MAX_VA / 1000} kVA LV (TR) ceiling — MV (TM) service with primary metering; coordinate the connection with PLN.`
    : direct
      ? `Subscribe ${serviceVa.toLocaleString('en-US')} VA — direct (whole-current) kWh metering at ${round(serviceCurrentA, 1)} A.`
      : `Subscribe ${serviceVa.toLocaleString('en-US')} VA — CT-operated kWh metering, ${ctRatio} class ${METERING_CT_CLASS} (service current ${round(serviceCurrentA, 1)} A).`;

  return {
    serviceVa,
    demandVa: round(demandVa, 0),
    serviceCurrentA: round(serviceCurrentA, 1),
    metering: direct ? 'direct' : 'ct',
    ...(ctRatio !== undefined ? { ctRatio, ctClass: METERING_CT_CLASS } : {}),
    mvService,
    note,
  };
}
