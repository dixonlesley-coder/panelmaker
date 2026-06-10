/** Browser-side file download helpers (work identically in Electron and web). */

/** Trigger a download of `text` as `filename` via a transient object-URL anchor. */
export function downloadText(filename: string, text: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download a CSV string (UTF-8 BOM so Excel opens it with the right encoding). */
export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, '﻿' + csv, 'text/csv;charset=utf-8');
}

/** Download an SVG markup string. */
export function downloadSvg(filename: string, svg: string): void {
  downloadText(filename, svg, 'image/svg+xml');
}
