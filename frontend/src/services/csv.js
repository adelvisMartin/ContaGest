import { downloadText } from '../utils/dom.js';

// Spreadsheet applications may ignore leading whitespace and invisible chars
// when detecting formulas. CSV quoting alone does not make a cell literal.
const FORMULA_PREFIX = /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]*[=+\-@]/u;

function csvCell(value) {
  const text = String(value ?? '');
  // Trusted numeric values (including negatives) must remain numbers when
  // opened by a spreadsheet; untrusted numeric-looking strings stay text.
  const safe = (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint'
    ? text
    : FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows = []) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\n');
}

export function downloadCsv(filename, rows) {
  downloadText(filename, toCsv(rows), 'text/csv;charset=utf-8');
}
