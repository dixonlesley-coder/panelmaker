import { describe, it, expect } from 'vitest';
import {
  STANDARD_REFERENCES,
  STANDARDS_VERSION,
  standardsReferenceSummary,
} from '@shared/standards';

describe('standards references', () => {
  it('lists the key sizing rules with non-empty topic + clause', () => {
    expect(STANDARD_REFERENCES.length).toBeGreaterThan(0);
    for (const ref of STANDARD_REFERENCES) {
      expect(ref.key).toMatch(/^[a-z0-9-]+$/);
      expect(ref.topic.length).toBeGreaterThan(0);
      expect(ref.clause.length).toBeGreaterThan(0);
    }
  });

  it('has unique reference keys', () => {
    const keys = STANDARD_REFERENCES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers the core PUIL/IEC sizing rules', () => {
    const keys = new Set(STANDARD_REFERENCES.map((r) => r.key));
    for (const expected of [
      'cable-ampacity',
      'voltage-drop',
      'protection-coordination',
      'disconnection-time',
      'protective-conductor',
      'rcd',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('cites PUIL 2011 and IEC standards', () => {
    const allClauses = STANDARD_REFERENCES.map((r) => r.clause).join(' ');
    expect(allClauses).toMatch(/PUIL 2011/);
    expect(allClauses).toMatch(/IEC 60364/);
  });

  it('stamps the summary with the standards version', () => {
    const summary = standardsReferenceSummary();
    expect(summary).toContain(STANDARDS_VERSION);
    expect(summary).toContain('PUIL 2011');
  });
});
