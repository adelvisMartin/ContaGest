import { downloadText } from '../utils/dom.js';
import { neutralizeSpreadsheetFormula } from '../utils/csvFormulaGuard.js';

export function encodeCsvCell(value) {
  const safe = neutralizeSpreadsheetFormula(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows = []) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(encodeCsvCell).join(','),
    ...rows.map((row) => headers.map((key) => encodeCsvCell(row[key])).join(','))
  ].join('\r\n');
}

export function downloadCsv(filename, rows) {
  downloadText(filename, toCsv(rows), 'text/csv;charset=utf-8');
}
