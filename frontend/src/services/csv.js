import { downloadText } from '../utils/dom.js';

// A spreadsheet may interpret text starting with these symbols as a formula,
// even when preceded by invisible whitespace. Keep the original cell value
// intact for CSV consumers; prefix a literal apostrophe only in the export.
const FORMULA_PREFIX = /^[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200f\u2028-\u202e\u202f\u205f\u2060-\u2069\u3000\ufeff]*[=+\-@]/u;

export function encodeCsvCell(value) {
  const raw = String(value ?? '');
  const numeric = (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint';
  const safe = !numeric && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
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
