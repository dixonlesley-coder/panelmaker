/**
 * Enclosure thermal-verification and IP-rating reference data, stamped with
 * STANDARDS_VERSION.
 *
 * IEC 61439-1 §9.3.2 requires the temperature rise of an assembly to stay within
 * limits so that mounted devices are not operated above their rated ambient. The
 * simplified power-balance method of IEC 60890 models an enclosure as a body that
 * dissipates its internal heat loss through its exposed surfaces by natural
 * convection and radiation, giving the steady-state internal air temperature rise
 * over the surrounding ambient.
 *
 * Ingress-protection (IP) classification follows IEC 60529: the two digits encode
 * protection against solid bodies/dust and against water, and the right code for a
 * given environment is what keeps the assembly's withstand valid in service.
 *
 * Every figure here is a defensible first-pass engineering value — verify against
 * the actual device losses, the manufacturer's enclosure data and PUIL 2011.
 */

import { STANDARDS_VERSION } from './version';

/** Version stamp for the enclosure-thermal dataset (atomic with the engine). */
export const ENCLOSURE_THERMAL_STANDARD = STANDARDS_VERSION;

/**
 * Surface heat-transfer coefficient `k` for a painted sheet-steel enclosure wall
 * under natural convection plus radiation (W per m² per K of air-to-ambient
 * temperature difference).
 *
 * Per the IEC 60890 simplified method, the heat a wall sheds is `k · A · ΔT`. For
 * painted sheet steel the effective coefficient sits in the range ≈ 5–6 W/m²K;
 * 5.5 is taken as a representative middle value. Bare/galvanised or polished
 * surfaces radiate less and sit lower; this constant assumes a normally painted
 * (matte) finish.
 */
export const ENCLOSURE_HEAT_DISSIPATION_W_PER_M2K = 5.5;

/**
 * Typical allowable internal air-temperature rise (K) above ambient before
 * device derating becomes necessary.
 *
 * IEC 61439-1 §9.3.2 permits higher rises for busbars and switchgear withstand
 * (e.g. 70 K and above for terminals/connections), but the *ratings* of most
 * installed components (MCBs, MCCBs, contactors, relays) are referenced to an
 * ambient of around 40 °C, so an internal air rise beyond ≈ 35 K over a hot
 * ambient pushes devices past their rated air temperature and forces derating.
 * 35 K is therefore used as the practical design ceiling for the cabinet air.
 */
export const MAX_INTERNAL_TEMP_RISE_K = 35;

/**
 * Effective heat-dissipating surface area (m²) of a rectangular enclosure.
 *
 * An enclosure sheds heat through the faces exposed to ambient air. A face pressed
 * against a structure dissipates negligibly and is excluded (IEC 60890 applies
 * surface factors that reduce or remove obstructed faces):
 *   - `wall`: wall-mounted — the back face is against the wall, so it is excluded.
 *   - `free-standing`: floor-standing — the bottom face is on the floor, so it is
 *     excluded.
 * Both mountings therefore expose five of the six faces. Dimensions are millimetres
 * and converted to metres; the result is an approximate but documented effective
 * area for the power-balance method.
 *
 * @param wMm Enclosure width (mm).
 * @param hMm Enclosure height (mm).
 * @param dMm Enclosure depth (mm).
 * @param mounting Installation type — `wall` excludes the back, `free-standing`
 *   excludes the bottom.
 * @returns Effective dissipating area in m².
 */
export function effectiveAreaM2(
  wMm: number,
  hMm: number,
  dMm: number,
  mounting: 'wall' | 'free-standing',
): number {
  const w = Math.max(0, wMm) / 1000;
  const h = Math.max(0, hMm) / 1000;
  const d = Math.max(0, dMm) / 1000;

  const front = w * h;
  const back = w * h;
  const top = w * d;
  const bottom = w * d;
  const left = h * d;
  const right = h * d;

  const fullSixFace = front + back + top + bottom + left + right;

  // Remove the obstructed face for the mounting type (IEC 60890 surface factors).
  const excluded = mounting === 'wall' ? back : bottom;
  return fullSixFace - excluded;
}

/** Environments the IP recommendation library distinguishes between. */
export type EnclosureEnvironment = 'indoor' | 'indoor_dusty' | 'outdoor' | 'washdown';

/** An IP-rating recommendation entry: the environment, the IP code, and the rationale. */
export interface IpRecommendation {
  /** The service environment this entry covers. */
  environment: string;
  /** Recommended IP code per IEC 60529 (e.g. `'IP54'`). */
  ip: string;
  /** Short engineering note explaining the choice. */
  note: string;
}

/**
 * IP-rating recommendations by environment (IEC 60529). Hazardous areas are out of
 * scope for an ordinary IP rating and require purpose-built (e.g. Ex/explosion-proof)
 * equipment, which is flagged as a special case.
 */
export const IP_RECOMMENDATIONS: readonly IpRecommendation[] = [
  {
    environment: 'indoor',
    ip: 'IP41',
    note: 'Indoor clean/dry area: IP31 (drip) to IP41 — keeps fingers and falling dirt out.',
  },
  {
    environment: 'indoor_dusty',
    ip: 'IP54',
    note: 'Indoor dusty/industrial area: IP54 — dust-protected and splash-proof.',
  },
  {
    environment: 'outdoor',
    ip: 'IP65',
    note: 'Outdoor exposure: IP65 — dust-tight and protected against low-pressure water jets.',
  },
  {
    environment: 'washdown',
    ip: 'IP65',
    note: 'Washdown/hose-down area: IP65 minimum — dust-tight and water-jet protected.',
  },
  {
    environment: 'hazardous',
    ip: 'special',
    note: 'Hazardous (explosive) atmosphere: ordinary IP is insufficient — use Ex-rated equipment.',
  },
];

/**
 * Recommend an IP code (IEC 60529) for a service environment.
 *
 * Indoor-clean returns IP31/IP41-class protection, indoor-dusty/industrial returns
 * IP54, and outdoor/washdown returns IP65. The returned note carries the rationale.
 *
 * @param environment The service environment.
 * @returns The recommended IP `code` and an explanatory `note`.
 */
export function recommendIp(environment: EnclosureEnvironment): { code: string; note: string } {
  const match = IP_RECOMMENDATIONS.find((r) => r.environment === environment);
  if (match) return { code: match.ip, note: match.note };
  // Defensive fallback — never expected given the typed environment.
  const indoor = IP_RECOMMENDATIONS[0]!;
  return { code: indoor.ip, note: indoor.note };
}
