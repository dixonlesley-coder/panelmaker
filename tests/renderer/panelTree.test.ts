import { describe, it, expect } from 'vitest';
import { fedSubPanelNames } from '@renderer/lib/panelTree';
import type { CircuitInput, PanelInput, ProjectInput } from '@shared/types';

function feeder(id: string, feedsPanelId: string): CircuitInput {
  return {
    id,
    name: `Feeder ${feedsPanelId}`,
    role: 'branch',
    loadW: 0,
    cosPhi: 0.85,
    lengthM: 20,
    loadKind: 'feeder',
    isLighting: false,
    demandFactor: 1,
    feedsPanelId,
  };
}

function panel(id: string, name: string, circuits: CircuitInput[] = []): PanelInput {
  return {
    id,
    name,
    system: '3ph',
    voltageV: 400,
    ambientTempC: 30,
    installMethod: 'conduit',
    groupingCount: 1,
    diversityFactor: 1,
    sourceType: 'utility',
    circuits,
  };
}

// MDP feeds SP-1 and SP-2; SP-1 feeds SP-1a. LP is standalone.
const project: ProjectInput = {
  id: 'prj',
  name: 'Test',
  panels: [
    panel('mdp', 'MDP', [feeder('f1', 'sp1'), feeder('f2', 'sp2')]),
    panel('sp1', 'Sub-panel 1', [feeder('f3', 'sp1a')]),
    panel('sp2', 'Sub-panel 2'),
    panel('sp1a', 'Sub-panel 1a'),
    panel('lp', 'Standalone LP'),
  ],
};

describe('fedSubPanelNames', () => {
  it('lists the direct children of a deleted feeder panel', () => {
    expect(fedSubPanelNames(project, ['mdp'])).toEqual(['Sub-panel 1', 'Sub-panel 2']);
    expect(fedSubPanelNames(project, ['sp1'])).toEqual(['Sub-panel 1a']);
  });

  it('returns [] for leaf or standalone panels', () => {
    expect(fedSubPanelNames(project, ['sp2'])).toEqual([]);
    expect(fedSubPanelNames(project, ['lp'])).toEqual([]);
    expect(fedSubPanelNames(project, [])).toEqual([]);
  });

  it('does not report a child that is itself being deleted (multi-select)', () => {
    expect(fedSubPanelNames(project, ['mdp', 'sp1'])).toEqual(['Sub-panel 2', 'Sub-panel 1a']);
    expect(fedSubPanelNames(project, ['mdp', 'sp1', 'sp2', 'sp1a'])).toEqual([]);
  });
});
