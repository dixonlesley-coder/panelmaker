import type { ControlSchematic } from '../../types';

/**
 * Reconcile a freshly regenerated schematic with one the user may have edited:
 * generated (template) rungs are replaced by the regenerated set, while
 * hand-authored rungs (generated === false) — and their symbols/connections —
 * are preserved and appended after. This is the "regenerate without clobbering
 * manual work" rule.
 */
export function mergeSchematic(
  existing: ControlSchematic,
  regenerated: ControlSchematic,
): ControlSchematic {
  const manualRungs = existing.rungs.filter((r) => !r.generated);
  const manualRungIds = new Set(manualRungs.map((r) => r.id));

  const manualSymbols = existing.symbols.filter((s) => manualRungIds.has(s.rungId));
  const manualSymIds = new Set(manualSymbols.map((s) => s.id));
  const manualConns = existing.connections.filter(
    (c) => manualSymIds.has(c.fromSymbolId) || manualSymIds.has(c.toSymbolId),
  );

  const rungs = [
    ...regenerated.rungs,
    ...manualRungs.map((r, i) => ({ ...r, order: regenerated.rungs.length + i })),
  ];

  return {
    circuitId: regenerated.circuitId,
    rungs,
    symbols: [...regenerated.symbols, ...manualSymbols],
    connections: [...regenerated.connections, ...manualConns],
  };
}
