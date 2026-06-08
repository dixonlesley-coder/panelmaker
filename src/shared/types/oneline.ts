/** Hybrid power one-line: energy sources converging on the main LV bus. */

export type PowerNodeKind =
  | 'utility'
  | 'transformer'
  | 'generator'
  | 'ats'
  | 'pv'
  | 'pv-inverter'
  | 'battery'
  | 'battery-inverter'
  | 'bus'
  | 'main-panel';

export interface PowerNode {
  id: string;
  kind: PowerNodeKind;
  label: string;
  sub?: string;
}

export interface PowerEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export type PowerInterlockKind = 'mechanical' | 'electrical';

export interface PowerInterlock {
  id: string;
  kind: PowerInterlockKind;
  /** The two nodes the interlock acts between. */
  aId: string;
  bId: string;
  relation: 'mutual_exclusion' | 'sequence' | 'permissive';
  note: string;
}

export interface PowerOneline {
  nodes: PowerNode[];
  edges: PowerEdge[];
  interlocks: PowerInterlock[];
}
