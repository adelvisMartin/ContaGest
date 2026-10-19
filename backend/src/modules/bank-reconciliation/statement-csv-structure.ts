/** RFC4180-compatible CSV row framing for untrusted bank extracts.
 * This is STRUCTURE only: finance amounts/dates are parsed by statement-parser.
 */
export class StatementCsvStructureError extends Error {
  constructor() { super('BANK_STATEMENT_CSV_MALFORMED'); }
}

export function parseStatementCsvRows(text: string): string[][] {
  if (typeof text !== 'string') throw new StatementCsvStructureError();
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let state: 'start' | 'plain' | 'quoted' | 'after-quote' = 'start';
  const field = () => { row.push(cell); cell = ''; state = 'start'; };
  const line = () => { field(); if (row.some(v => v.trim().length > 0)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else state = 'after-quote';
      } else cell += ch;
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
    cell += ch;
    state = 'plain';
  }
  if (state === 'quoted') throw new StatementCsvStructureError();
  if (state !== 'start' || cell.length > 0 || row.length > 0) line();
  return rows;
}
