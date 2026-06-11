/**
 * Orchestrate the one-click "export all deliverables" action.
 *
 * Desktop: the user picks ONE folder; the system PDF renders in the main
 * process and every other artifact (BOM xlsx, cable-schedule CSV, per-panel
 * DXFs) is written next to it — no per-file save dialogs. Web: there is no PDF
 * renderer or folder access, so the artifacts fall back to sequential browser
 * downloads (slightly spaced so the browser doesn't drop any).
 */

import { desktopApi } from '@renderer/api';
import { useProjectStore } from '@renderer/state/projectStore';
import { systemResultFor } from '@renderer/state/useSystemResult';
import { partsForBrand } from '@shared/data/catalog';
import { costSystemConsolidated } from '@renderer/lib/bom';
import { buildDeliverables, safeStem, type Deliverable } from './deliverables';

export type ExportAllResult =
  | { ok: true; fileCount: number; dir?: string }
  | { ok: false; reason: 'cancelled' | 'error'; message: string };

/** Encode a deliverable for writing: text → UTF-8 bytes, binary as-is. */
function toBytes(file: Deliverable): Uint8Array {
  return typeof file.data === 'string' ? new TextEncoder().encode(file.data) : file.data;
}

/** Trigger a browser download of one deliverable via a transient object URL. */
function downloadDeliverable(file: Deliverable): void {
  const blob = new Blob([file.data as BlobPart], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Export every project deliverable in one go, reading the working project (and
 * the preferred order-code brand) from the store. Returns what happened so the
 * caller can toast a localised message.
 */
export async function exportAllDeliverables(): Promise<ExportAllResult> {
  const { project, parts, prices, preferredBrand } = useProjectStore.getState();
  const system = systemResultFor(project);
  const bomParts = partsForBrand(parts, preferredBrand);
  const bom = costSystemConsolidated(system, bomParts, new Map(Object.entries(prices)));
  const files = buildDeliverables(project, system, bom);

  const api = desktopApi();
  if (api) {
    const dir = await api.chooseDirectory();
    if (!dir) return { ok: false, reason: 'cancelled', message: 'Export cancelled.' };
    try {
      await api.exportSystemPdf(project, `${dir}/${safeStem(project.name)} - system.pdf`);
      for (const file of files) {
        await api.writeExportFile(`${dir}/${file.filename}`, toBytes(file));
      }
      return { ok: true, fileCount: files.length + 1, dir };
    } catch (e) {
      return { ok: false, reason: 'error', message: (e as Error).message };
    }
  }

  // Web preview: sequential downloads; the PDF needs the desktop main process.
  for (const [i, file] of files.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 300));
    downloadDeliverable(file);
  }
  return { ok: true, fileCount: files.length };
}

/** Minimal translate signature (avoids coupling this lib to i18next types). */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Localised toast message for an export-all outcome (caller shows it). */
export function exportAllMessage(t: Translate, res: ExportAllResult): string {
  if (!res.ok) {
    return res.reason === 'cancelled' ? t('system.exportAllCancelled') : res.message;
  }
  return res.dir !== undefined
    ? t('system.exportAllDone', { count: res.fileCount, dir: res.dir })
    : t('system.exportAllDoneWeb', { count: res.fileCount });
}
