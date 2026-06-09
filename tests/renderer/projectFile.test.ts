import { describe, it, expect } from 'vitest';
import {
  PROJECT_FILE_FORMAT,
  PROJECT_FILE_VERSION,
  parseProjectFile,
  serializeProject,
  type ProjectFileEnvelope,
} from '@renderer/lib/projectFile';
import { createSampleProject } from '@renderer/data/sampleProject';

describe('projectFile (serialize / parse)', () => {
  it('round-trips a project through serialize -> parse (content preserved)', () => {
    const project = createSampleProject();
    const text = serializeProject(project);
    const restored = parseProjectFile(text);

    // Structure and content survive the round trip…
    expect(restored.name).toBe(project.name);
    expect(restored.panels.length).toBe(project.panels.length);
    expect(restored.panels.map((p) => p.name)).toEqual(project.panels.map((p) => p.name));
    // …including a scheduled circuit deep in the tree.
    const ev = restored.panels
      .flatMap((p) => p.circuits)
      .find((c) => c.loadKind === 'ev_charger');
    expect(ev?.schedule).toEqual({ startHour: 22, endHour: 6 });
  });

  it('writes a versioned envelope with the expected format/version fields', () => {
    const project = createSampleProject();
    const envelope = JSON.parse(serializeProject(project)) as ProjectFileEnvelope;
    expect(envelope.format).toBe(PROJECT_FILE_FORMAT);
    expect(envelope.version).toBe(PROJECT_FILE_VERSION);
    expect(typeof envelope.exportedAt).toBe('string');
    expect(envelope.project.name).toBe(project.name);
  });

  it('assigns a fresh id on import so it cannot overwrite the source project', () => {
    const project = createSampleProject();
    const restored = parseProjectFile(serializeProject(project));
    expect(restored.id).not.toBe(project.id);
    expect(restored.id.length).toBeGreaterThan(0);

    // Two imports of the same file yield distinct ids.
    const text = serializeProject(project);
    const a = parseProjectFile(text);
    const b = parseProjectFile(text);
    expect(a.id).not.toBe(b.id);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseProjectFile('not json at all {')).toThrow(/valid JSON/i);
  });

  it('rejects a JSON document that is not a project envelope', () => {
    expect(() => parseProjectFile(JSON.stringify({ hello: 'world' }))).toThrow(
      /file format|PanelMaker project/i,
    );
  });

  it('rejects an envelope with no panels', () => {
    const bad = JSON.stringify({
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      project: { id: 'x', name: 'Empty', panels: [] },
    });
    expect(() => parseProjectFile(bad)).toThrow(/no panels/i);
  });

  it('rejects an envelope whose project is missing entirely', () => {
    const bad = JSON.stringify({
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      exportedAt: new Date().toISOString(),
    });
    expect(() => parseProjectFile(bad)).toThrow(/missing its project/i);
  });
});
