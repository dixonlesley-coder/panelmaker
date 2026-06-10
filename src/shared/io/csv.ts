/**
 * Hand-rolled, dependency-free CSV reader/writer following RFC 4180.
 *
 * Pure TypeScript: no Node, no DOM, no third-party libraries. Lives in
 * `src/shared` so it can be reused by the renderer (import button / export menu)
 * and the Electron main process (IPC file handlers) alike.
 *
 * Supported by {@link parseCsv}:
 * - quoted fields wrapping commas, CR, LF and CRLF;
 * - escaped quotes inside a quoted field, written as a doubled `""`;
 * - mixed CRLF / LF / CR line endings;
 * - a trailing newline (which does NOT produce a spurious empty final row).
 *
 * Produced by {@link toCsv}:
 * - CRLF (`\r\n`) line endings, per the RFC;
 * - automatic quoting of any field containing a comma, a double-quote, CR or LF;
 * - numbers stringified with the default JS conversion.
 */

/**
 * Parse RFC-4180 CSV text into a 2-D array of string cells (rows of fields).
 *
 * The parser is a single-pass character state machine, so it never mis-splits on
 * commas or newlines that appear inside quoted fields. Quotes are only special at
 * the very start of a field; a `"` inside an unquoted field is treated literally.
 *
 * Edge cases:
 * - An empty input string yields `[]` (zero rows).
 * - A non-empty input always yields at least one row.
 * - A single trailing line terminator is consumed and does not emit an empty row,
 *   but a blank line in the middle of the text is preserved as a `['']` row.
 *
 * @param text Raw CSV document text.
 * @returns Rows of string fields; never `null`/`undefined`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  if (text.length === 0) return rows;

  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  /** True once any character of the current field/row has been seen. */
  let started = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    started = true;

    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote ("") is a literal quote; a lone quote closes the field.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      // Opening quote only counts at the start of a field.
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      // Treat CRLF as one terminator: swallow a following LF.
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }

  // Flush the final field/row unless the text ended exactly on a row terminator
  // (in which case `started` was reset and there is nothing pending).
  if (started || field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}

/**
 * Determine whether a single CSV field must be wrapped in double quotes.
 *
 * Per RFC 4180 a field needs quoting when it contains a comma, a double-quote, or
 * a line break (CR or LF). Leading/trailing spaces are left unquoted (common,
 * tolerant behaviour) — callers wanting strict whitespace preservation can quote
 * upstream.
 */
function needsQuoting(value: string): boolean {
  return /[",\r\n]/.test(value);
}

/**
 * Quote and escape one field for output: wrap in `"` and double any embedded `"`.
 */
function escapeField(value: string): string {
  if (!needsQuoting(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Serialise a 2-D array of cells into an RFC-4180 CSV string.
 *
 * Numbers are converted with the default JS string coercion; every field is
 * quoted only when necessary. Rows are joined with CRLF and the document ends
 * with a trailing CRLF, so a round-trip through {@link parseCsv} reproduces the
 * original cell grid.
 *
 * @param rows Rows of string-or-number cells.
 * @returns A CSV document with CRLF line endings.
 */
export function toCsv(rows: (string | number)[][]): string {
  if (rows.length === 0) return '';
  return (
    rows
      .map((row) => row.map((cell) => escapeField(String(cell))).join(','))
      .join('\r\n') + '\r\n'
  );
}
