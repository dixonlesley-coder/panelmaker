/**
 * In-app catalogue-PDF extraction.
 *
 * Spawns the bundled Python extractor (PyInstaller binary) in `--auto-json`
 * mode and returns the detected ordering tables. Column mapping + validation
 * happen in the renderer (pure `@shared` code) against these raw tables, so this
 * service stays a thin, side-effect-light bridge.
 *
 * Binary resolution:
 *   - packaged: <resources>/resources/extractor/extract_catalogue[.exe]
 *     (electron-builder ships repo `resources/` → there; the CI PyInstaller step
 *      drops the binary in before packaging).
 *   - dev / unpackaged: run scripts/extract_catalogue.py with the system Python
 *     (the dataset author has it; end users get the bundled binary).
 * Missing in both → a clear error the UI surfaces (the JSON/CSV import still works).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { RawTable } from '@shared/data/catalog';

interface AutoJsonOut {
  pages?: number;
  tables?: RawTable[];
}

/** Resolve how to invoke the extractor, or `null` when it isn't available. */
function resolveExtractor(): { cmd: string; baseArgs: string[] } | null {
  const binName = process.platform === 'win32' ? 'extract_catalogue.exe' : 'extract_catalogue';
  if (app.isPackaged) {
    const bin = join(process.resourcesPath, 'resources', 'extractor', binName);
    return existsSync(bin) ? { cmd: bin, baseArgs: [] } : null;
  }
  const script = join(app.getAppPath(), 'scripts', 'extract_catalogue.py');
  if (!existsSync(script)) return null;
  return { cmd: process.platform === 'win32' ? 'python' : 'python3', baseArgs: [script] };
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, { windowsHide: true });
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => reject(new Error(`extractor failed to start: ${e.message}`)));
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `extractor exited with code ${code}`)),
    );
  });
}

/** Extract the ordering tables from a PDF (optionally limited to `pages`, "A-B"). */
export async function extractPdfTables(
  pdfPath: string,
  pages?: string,
): Promise<{ pages?: number; tables: RawTable[] }> {
  const tool = resolveExtractor();
  if (!tool) {
    throw new Error('The PDF extractor is not available in this build. Use the JSON/CSV import instead.');
  }
  const args = [...tool.baseArgs, '--pdf', pdfPath, '--auto-json', ...(pages ? ['--pages', pages] : [])];
  const stdout = await runCapture(tool.cmd, args);
  let parsed: AutoJsonOut;
  try {
    parsed = JSON.parse(stdout) as AutoJsonOut;
  } catch {
    throw new Error('The extractor returned no readable tables (is the PDF text-based?).');
  }
  return { pages: parsed.pages, tables: parsed.tables ?? [] };
}
