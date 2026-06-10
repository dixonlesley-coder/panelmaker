import type { Warning } from '@shared/types';
import type { NodeIssue } from '@renderer/screens/sld/nodes';

/** Flatten engine warnings into the node-attached issue shape (message + fixes). */
export function toNodeIssues(warnings: Warning[]): NodeIssue[] {
  return warnings.map((w) => ({
    severity: w.severity,
    message: w.message,
    fixes: (w.fixes ?? []).map((f) => f.description),
  }));
}

/** Issues for a specific circuit (branch node). */
export function circuitIssues(warnings: Warning[], circuitId: string): NodeIssue[] {
  return toNodeIssues(warnings.filter((w) => w.circuitId === circuitId));
}

/** Panel-level issues not tied to a circuit, excluding busbar-specific codes. */
export function incomerIssues(warnings: Warning[]): NodeIssue[] {
  return toNodeIssues(
    warnings.filter((w) => w.circuitId === undefined && !w.code.startsWith('busbar')),
  );
}

/** Busbar-specific issues (short-circuit withstand). */
export function busbarIssues(warnings: Warning[]): NodeIssue[] {
  return toNodeIssues(warnings.filter((w) => w.code.startsWith('busbar')));
}
