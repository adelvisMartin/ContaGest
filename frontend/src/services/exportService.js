import { downloadText } from '../utils/dom.js';
import { toCsv } from './csv.js';
import { BackendApi } from './backendApi.js';

const clean = (value) => String(value ?? '').replace(/<[^>]*>/g, '').trim();
const escapeXml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function rowsToObjects(rows = []) { return Array.isArray(rows) ? rows.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row })) : []; }
function objectRowsToHtmlTable(rows = [], title = 'Exportación ContaGest-VE') {
  const normalized = rowsToObjects(rows);
  const headers = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));
  const head = headers.map((h) => `<th>${escapeXml(h)}</th>`).join('');
  const body = normalized.map((row) => `<tr>${headers.map((h) => `<td>${escapeXml(row[h] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:8px}th{background:#00236f;color:#fff}</style></head><body><h1>${escapeXml(title)}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
async function downloadBlobFromBackend(endpoint, payload, fallback) {
  try {
    const baseUrl = localStorage.getItem('contagest_api_base_url') || 'http://localhost:3030/api/v1';
    const response = await fetch(`${baseUrl}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': localStorage.getItem('contagest_tenant_id') || 'demo-tenant' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Backend export ${response.status}`);
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${payload.filename || 'contagest-export'}.bin`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.warn('[ExportService] backend unavailable, using fallback', error);
    fallback?.();
    return false;
  }
}
export const ExportService = {
  downloadCsv(filename, rows) { downloadText(filename.endsWith('.csv') ? filename : `${filename}.csv`, toCsv(rowsToObjects(rows)), 'text/csv;charset=utf-8'); },
  downloadTxt(filename, rows, header = 'ContaGest-VE Export') {
    const normalized = rowsToObjects(rows);
    const lines = [header, '-'.repeat(header.length), ...normalized.map((row) => Object.entries(row).map(([k,v]) => `${k}: ${clean(v)}`).join(' | '))];
    downloadText(filename.endsWith('.txt') ? filename : `${filename}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
  },
  downloadExcel(filename, rows, title = 'ContaGest-VE') {
    const html = objectRowsToHtmlTable(rows, title);
    downloadText(filename.endsWith('.xls') ? filename : `${filename}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
  },
  async downloadXlsx(filename, sheets = [], title = 'ContaGest-VE') {
    const normalizedSheets = Array.isArray(sheets) && sheets.length ? sheets : [{ name: 'Datos', rows: rowsToObjects(sheets) }];
    return downloadBlobFromBackend('/exports/xlsx', { filename, title, sheets: normalizedSheets }, () => this.downloadExcel(filename, normalizedSheets[0]?.rows || [], title));
  },
  async downloadFiscalPdf(filename, document = {}) {
    return downloadBlobFromBackend('/exports/fiscal-pdf', { filename, document }, () => this.printOrPdf(document.title || 'Documento Fiscal ContaGest-VE'));
  },
  downloadJson(filename, data) { downloadText(filename.endsWith('.json') ? filename : `${filename}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8'); },
  printOrPdf(title = 'Documento ContaGest-VE') { document.title = title; window.print(); },
  tableToRows(selector) {
    const table = document.querySelector(selector);
    if (!table) return [];
    const headers = [...table.querySelectorAll('thead th')].map((th) => clean(th.textContent));
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => clean(td.textContent));
      return Object.fromEntries(headers.map((h, index) => [h || `col_${index + 1}`, cells[index] || '']));
    });
  }
};
