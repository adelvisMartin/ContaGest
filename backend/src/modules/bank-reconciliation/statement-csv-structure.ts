/** RFC4180-compatible CSV framing for untrusted bank extracts.
 * This is STRUCTURE only: finance amounts/dates are parsed by statement-parser.
 * Limits prevent a small CSV made of delimiters from allocating millions of cells.
 */
export const MAX_STATEMENT_CSV_COLUMNS = 128;
export const MAX_STATEMENT_CSV_ROWS = 100_000;
export const MAX_STATEMENT_CSV_FIELDS = 1_000_000;
export const MAX_STATEMENT_CSV_FIELD_CHARS = 16_384;

export class StatementCsvStructureError extends Error {
  readonly code: 'BANK_STATEMENT_CSV_MALFORMED' | 'BANK_STATEMENT_CSV_LIMIT_EXCEEDED';
  constructor(code: 'BANK_STATEMENT_CSV_MALFORMED' | 'BANK_STATEMENT_CSV_LIMIT_EXCEEDED' = 'BANK_STATEMENT_CSV_MALFORMED') {
    super(code);
    this.code = code;
  }
}

export function parseStatementCsvRows(text: string): string[][] {
  if (typeof text !== 'string') throw new StatementCsvStructureError();
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let fields = 0;
  let state: 'start' | 'plain' | 'quoted' | 'after-quote' = 'start';
  const append = (char: string) => {
    cell += char;
    if (cell.length > MAX_STATEMENT_CSV_FIELD_CHARS) throw new StatementCsvStructureError('BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
  };
  const field = () => {
    row.push(cell);
    if (row.length > MAX_STATEMENT_CSV_COLUMNS || ++fields > MAX_STATEMENT_CSV_FIELDS) {
      throw new StatementCsvStructureError('BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
    }
    cell = '';
    state = 'start';
  };
  const line = () => {
    field();
    if (row.some(value => value.trim().length > 0)) {
      rows.push(row);
      if (rows.length > MAX_STATEMENT_CSV_ROWS) throw new StatementCsvStructureError('BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { append('"'); i++; }
        else state = 'after-quote';
      } else append(ch);
      continue;
    }
    if (ch === '"') {
      if (state !== 'start') throw new StatementCsvStructureError();
      state = 'quoted';
      continue;
    }
    if (state === 'after-quote' && ch !== ',' && ch !== '\n' && ch !== '\r') {
      throw new StatementCsvStructureError();
    }
    if (ch === ',') { field(); continue; }
    if (ch === '\n') { line(); continue; }
    if (ch === '\r') {
      if (text[i + 1] === '\n') continue;
      line(); continue;
    }
    if (state === 'after-quote') throw new StatementCsvStructureError();
    append(ch);
    state = 'plain';
  }
  if (state === 'quoted') throw new StatementCsvStructureError();
  if (state !== 'start' || cell.length > 0 || row.length > 0) line();
  return rows;
}
