/**
 * Standards clause references for the sizing rules the engine applies.
 *
 * This maps each key calculation to the PUIL 2011 (SNI 0225:2011) /
 * IEC 60364 / IEC 60947 clause(s) it follows. The citations are drawn from the
 * reference-data comments across `src/shared/standards/*` (the single source of
 * truth for the engine's constants), so the printed references and the code stay
 * in step. Stamped with {@link STANDARDS_VERSION}, this is pure data — diffable
 * and unit-testable like the rest of the standards layer.
 *
 * It carries no DOM/Node dependency, so both the renderer (compact on-screen
 * footnote) and the main process (PDF report footer) can read it.
 */

import { STANDARDS_VERSION } from './version';

/** A single sizing rule and the standard clause(s) that govern it. */
export interface StandardReference {
  /** Stable key, usable for i18n or programmatic lookup. */
  key: string;
  /** Short title of the rule the engine applies. */
  topic: string;
  /** The standard clause / table citation(s). */
  clause: string;
}

/**
 * The reference catalogue, ordered roughly as a circuit is sized
 * (load → cable → protection → earthing → system).
 */
export const STANDARD_REFERENCES: readonly StandardReference[] = [
  {
    key: 'cable-ampacity',
    topic: 'Cable current-carrying capacity (KHA)',
    clause: 'PUIL 2011 (SNI 0225:2011) Table 7.3-1; IEC 60364-5-52 Table B.52.x',
  },
  {
    key: 'derating',
    topic: 'Ambient-temperature & grouping derating factors',
    clause: 'IEC 60364-5-52 Table B.52.14 (temperature), Table B.52.17 (grouping)',
  },
  {
    key: 'voltage-drop',
    topic: 'Voltage drop (≤ 3% lighting / 5% power)',
    clause: 'PUIL 2011 §4.2.3 / 5.2; IEC 60364-5-52 §525',
  },
  {
    key: 'protection-coordination',
    topic: 'Overload protection (Iz ≥ max(In, 1.25·Ib); In ≥ Ib)',
    clause: 'IEC 60364-4-43 §433; MCB IEC 60898; MCCB IEC 60947-2',
  },
  {
    key: 'fault-breaking-capacity',
    topic: 'Short-circuit breaking capacity & fault levels',
    clause: 'IEC 60909 (fault levels); IEC 60898 / 60947-2 (Icu)',
  },
  {
    key: 'disconnection-time',
    topic: 'Earth-fault loop impedance & disconnection time (Zs ≤ Zs,max)',
    clause: 'IEC 60364-4-41 §411 (protection against electric shock)',
  },
  {
    key: 'protective-conductor',
    topic: 'Protective (PE) conductor sizing',
    clause: 'IEC 60364-5-54 Table 54.2',
  },
  {
    key: 'main-bonding',
    topic: 'Main earthing & protective bonding conductors',
    clause: 'IEC 60364-5-54 §544.1; PUIL 2011 §3.18',
  },
  {
    key: 'rcd',
    topic: 'Residual-current device (RCD) requirements by earthing system',
    clause: 'IEC 60364-4-41 §411.3.3; PUIL 2011 §3.16 (TN-S/TN-C-S/TT)',
  },
  {
    key: 'neutral-harmonics',
    topic: 'Neutral sizing for harmonic (triplen) currents',
    clause: 'IEC 60364-5-52 §523.6.3 / Annex E',
  },
  {
    key: 'conduit-fill',
    topic: 'Conduit / containment fill limits',
    clause: 'IEC 60364-5-52 (cable grouping); ≤ 53% single-cable fill',
  },
  {
    key: 'enclosure',
    topic: 'Assembly / enclosure construction & temperature rise',
    clause: 'IEC 61439-1/-2 (low-voltage switchgear assemblies)',
  },
  {
    key: 'power-factor',
    topic: 'Power-factor correction (PLN penalty below 0.85)',
    clause: 'PUIL 2011 §5.5; IEC 61921 (capacitor banks)',
  },
  {
    key: 'transformer-supply',
    topic: 'LV vs MV supply & distribution transformer (200 kVA ceiling)',
    clause: 'PUIL 2011 §8; IEC 60076 (power transformers)',
  },
] as const;

/**
 * A one-line plain-text citation summary, e.g. for a PDF report footer.
 * Standards-version stamped so older exports remain attributable.
 */
export function standardsReferenceSummary(): string {
  return (
    'Standards references (PUIL 2011 / IEC 60364) — ' +
    STANDARD_REFERENCES.map((r) => `${r.topic}: ${r.clause}`).join('; ') +
    `. [${STANDARDS_VERSION}]`
  );
}
