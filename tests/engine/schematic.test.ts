import { describe, it, expect } from 'vitest';
import {
  applyStarterTemplate,
  applyPumpControl,
  buildSchematic,
  mergeSchematic,
} from '@shared/engine';
import type { SchematicRung, SchematicSymbol } from '@shared/types';

describe('buildSchematic', () => {
  it('generates a DOL ladder with a coil, overload and stop button', () => {
    const a = applyStarterTemplate({ circuitId: 'c', starterType: 'DOL', motorKw: 5.5 });
    const s = buildSchematic(a);
    expect(s.rungs.length).toBeGreaterThanOrEqual(2);
    expect(s.symbols.some((x) => x.type === 'coil' && x.deviceRef?.element === 'coil')).toBe(true);
    expect(s.symbols.some((x) => x.type === 'overload-contact')).toBe(true);
    expect(s.symbols.some((x) => x.type === 'pushbutton-nc' && x.label === 'Stop')).toBe(true);
    expect(s.symbols.every((x) => x.generated)).toBe(true);
  });

  it('generates star-delta rungs with the star<->delta interlock contacts', () => {
    const a = applyStarterTemplate({ circuitId: 'c', starterType: 'STAR_DELTA', motorKw: 37 });
    const s = buildSchematic(a);

    // three coils: main, star, delta
    expect(s.symbols.filter((x) => x.type === 'coil').length).toBe(3);

    // the star rung carries an NC contact of the DELTA contactor, and vice-versa
    const deltaId = a.devices.find((d) => d.role === 'delta-contactor')!.id;
    const starId = a.devices.find((d) => d.role === 'star-contactor')!.id;
    const ncRefs = s.symbols.filter((x) => x.type === 'nc-contact').map((x) => x.deviceRef?.deviceId);
    expect(ncRefs).toContain(deltaId);
    expect(ncRefs).toContain(starId);
  });

  it('adds a level-control rung with dry-run protection for a fill pump', () => {
    const base = applyStarterTemplate({ circuitId: 'p', starterType: 'DOL', motorKw: 3 });
    const pump = applyPumpControl(base, 'fill');
    const s = buildSchematic(pump);
    expect(s.symbols.some((x) => x.type === 'level-contact')).toBe(true);
    expect(s.symbols.some((x) => x.type === 'nc-contact' && x.label === 'Dry-run')).toBe(true);
  });
});

describe('mergeSchematic (regenerate without clobbering manual edits)', () => {
  it('preserves hand-authored rungs and replaces generated ones', () => {
    const a = applyStarterTemplate({ circuitId: 'c', starterType: 'DOL', motorKw: 5.5 });
    const gen1 = buildSchematic(a);

    const manualRung: SchematicRung = {
      id: 'c:manual1',
      order: 99,
      label: 'Custom high-temp alarm',
      generated: false,
      locked: false,
    };
    const manualSym: SchematicSymbol = {
      id: 'c:ms1',
      rungId: 'c:manual1',
      type: 'lamp',
      col: 0,
      branch: 0,
      generated: false,
      label: 'ALARM',
    };
    const edited = {
      ...gen1,
      rungs: [...gen1.rungs, manualRung],
      symbols: [...gen1.symbols, manualSym],
    };

    const gen2 = buildSchematic(a);
    const merged = mergeSchematic(edited, gen2);

    // manual content survives
    expect(merged.rungs.some((r) => r.id === 'c:manual1')).toBe(true);
    expect(merged.symbols.some((s) => s.id === 'c:ms1')).toBe(true);
    // generated rungs are exactly the freshly regenerated set
    expect(merged.rungs.filter((r) => r.generated).length).toBe(gen2.rungs.length);
  });
});
