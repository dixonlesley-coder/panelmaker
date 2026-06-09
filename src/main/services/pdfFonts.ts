/**
 * Offline font provisioning for server-side pdfmake (`PdfPrinter`).
 *
 * pdfmake ships the Roboto family as base64 strings inside `build/vfs_fonts.js`
 * (a virtual filesystem used by the browser build). We decode those into
 * Buffers and hand them to `PdfPrinter` as font sources, so PDF generation is
 * fully self-contained with no network access or external font files.
 */

import type { TFontDictionary } from 'pdfmake/interfaces';
// Explicit `.js`: pdfmake has no `exports` entry for this deep file, so the
// packaged ESM main process can't resolve it without the extension (the dev
// bundler tolerates the bare specifier, but Node's ESM loader does not).
import vfsFonts from 'pdfmake/build/vfs_fonts.js';

/** The vfs is a `{ filename: base64 }` map. */
const vfs = vfsFonts as unknown as Record<string, string>;

/** Decode a base64 vfs entry into a Buffer (throws if the font is missing). */
function fontBuffer(file: string): Buffer {
  const b64 = vfs[file];
  if (!b64) {
    throw new Error(`Embedded font "${file}" not found in pdfmake vfs`);
  }
  return Buffer.from(b64, 'base64');
}

/**
 * The Roboto font dictionary built from the embedded vfs. Buffers are valid
 * `PDFFontSource`s, so no temp files are needed.
 */
export function robotoFonts(): TFontDictionary {
  return {
    Roboto: {
      normal: fontBuffer('Roboto-Regular.ttf'),
      bold: fontBuffer('Roboto-Medium.ttf'),
      italics: fontBuffer('Roboto-Italic.ttf'),
      bolditalics: fontBuffer('Roboto-MediumItalic.ttf'),
    },
  };
}
