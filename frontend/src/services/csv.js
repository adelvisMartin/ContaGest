import { downloadText } from '../utils/dom.js';

export function toCsv(rows = []) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
}

export function downloadCsv(filename, rows) {
  downloadText(filename, toCsv(rows), 'text/csv;charset=utf-8');
}
