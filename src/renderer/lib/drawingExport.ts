/**
 * Browser glue for downloading the pure drawing builders' output as files. The
 * SVG/DXF strings come from `@shared/drawing` (DOM-free); these helpers add the
 * anchor-download flow, the same pattern as `projectFile.ts` `downloadProjectFile`,
 * so they work in both the web build and the Electron renderer.
 */

/** Sanitise a filename stem (panel name) for the filesystem. */
function safeStem(stem: string): string {
  const trimmed = stem.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed.length > 0 ? trimmed : 'drawing';
}

/** Trigger a browser download of `text` as `filename` with the given MIME type. */
function downloadText(filename: string, text: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Release the object URL on the next tick so the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download an SVG string as `${stem}.svg`. */
export function downloadSvg(stem: string, svg: string): void {
  downloadText(`${safeStem(stem)}.svg`, svg, 'image/svg+xml');
}

/** Download a DXF string as `${stem}.dxf`. */
export function downloadDxf(stem: string, dxf: string): void {
  downloadText(`${safeStem(stem)}.dxf`, dxf, 'image/vnd.dxf');
}
