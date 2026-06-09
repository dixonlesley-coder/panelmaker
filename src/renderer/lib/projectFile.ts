/**
 * Portable project file import/export.
 *
 * The pure {@link serializeProject} / {@link parseProjectFile} pair wraps a
 * {@link ProjectInput} in a small, versioned envelope so projects can be moved
 * between machines as a single `.json` file. They contain no DOM access and are
 * unit-tested directly. The {@link downloadProjectFile} / {@link pickAndReadProjectFile}
 * helpers add the browser glue (anchor download + hidden file input) and work in
 * both the plain web build and the Electron renderer.
 */

import type { ProjectInput } from '@shared/types';

/** Envelope identifier stamped into every exported file. */
export const PROJECT_FILE_FORMAT = 'panelmaker-project';
/** Envelope schema version — bump if the on-disk shape changes incompatibly. */
export const PROJECT_FILE_VERSION = 1;

/** The on-disk shape of an exported project file. */
export interface ProjectFileEnvelope {
  format: typeof PROJECT_FILE_FORMAT;
  version: number;
  exportedAt: string;
  project: ProjectInput;
}

/** Monotonic id source for imported projects, kept distinct from store ids. */
let importSeq = 0;

/** A fresh, collision-resistant id for an imported project. */
function freshProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `PRJ-${crypto.randomUUID()}`;
  }
  return `PRJ-import-${Date.now()}-${(importSeq += 1)}`;
}

/** Serialize a project into a pretty-printed, versioned JSON envelope. */
export function serializeProject(project: ProjectInput): string {
  const envelope: ProjectFileEnvelope = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Narrow an unknown value to a record so property access is type-safe. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Parse and validate a project file's text, returning the contained project with
 * a freshly assigned id so importing never overwrites an existing project that
 * happens to share the same id. Throws a descriptive {@link Error} on malformed
 * input. Pure — safe to unit test without a DOM.
 */
export function parseProjectFile(text: string): ProjectInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('File is not a PanelMaker project.');
  }
  if (parsed.format !== PROJECT_FILE_FORMAT) {
    throw new Error('Unrecognised file format — expected a PanelMaker project export.');
  }

  const project = parsed.project;
  if (!isRecord(project)) {
    throw new Error('Project file is missing its project data.');
  }
  if (!Array.isArray(project.panels) || project.panels.length === 0) {
    throw new Error('Project file has no panels.');
  }
  if (typeof project.name !== 'string') {
    throw new Error('Project file is missing a project name.');
  }

  // Re-id on import so the file cannot clobber an existing stored project.
  return { ...(project as unknown as ProjectInput), id: freshProjectId() };
}

/** A filesystem-friendly base for a project's export filename. */
function safeFileBase(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed.length > 0 ? trimmed : 'project';
}

/**
 * Trigger a browser download of the project as `${name}.panelmaker.json`.
 * Works in the web build and the Electron renderer (both have a DOM); on the
 * desktop the user gets the renderer's download flow rather than a native
 * dialog, which keeps the code path identical.
 */
export function downloadProjectFile(project: ProjectInput): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileBase(project.name)}.panelmaker.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Release the object URL on the next tick so the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Open a hidden file picker, read the chosen `.json` file and parse it into a
 * {@link ProjectInput}. Rejects if the user cancels or the file is malformed.
 */
export function pickAndReadProjectFile(): Promise<ProjectInput> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('File import is only available in the app.'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      input.remove();
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('No file selected.'));
        }
        return;
      }
      file
        .text()
        .then((text) => {
          settled = true;
          cleanup();
          resolve(parseProjectFile(text));
        })
        .catch((e: unknown) => {
          settled = true;
          cleanup();
          reject(e instanceof Error ? e : new Error('Failed to read the file.'));
        });
    });

    // If the dialog is dismissed without a selection, the change event may not
    // fire; the focus-return cancel guard resolves the dangling promise.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            settled = true;
            cleanup();
            reject(new Error('Import cancelled.'));
          }
        }, 300);
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}
