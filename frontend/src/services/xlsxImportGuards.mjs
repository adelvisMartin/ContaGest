// Fail-closed guards for untrusted XLSX preview data. No persistence authority.
const MAX_IMPORT_COLUMNS = 128;
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_CELL_LENGTH = 8192;

export function xlsxColumnIndex(reference) {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/i.exec(reference ?? '');
  if (!match || Number(match[2]) > 1048576) {
    throw new TypeError('XLSX_CELL_REFERENCE_INVALID');
  }
  let index = 0;
  for (const character of match[1].toUpperCase()) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }
  if (index < 1 || index > MAX_IMPORT_COLUMNS) {
    throw new TypeError('XLSX_COLUMN_LIMIT');
  }
  return index - 1;
}

export function assertXlsxHeaders(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_IMPORT_COLUMNS) {
    throw new TypeError('XLSX_HEADERS_INVALID');
  }
  const normalized = values.map(value => String(value ?? '').trim());
  if (normalized.some(value => !value || value.length > 128 ||
      /[\u0000-\u001f\u007f]/u.test(value) ||
      ['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase())) ||
      new Set(normalized.map(value => value.toLowerCase())).size !== normalized.length) {
    throw new TypeError('XLSX_HEADERS_INVALID');
  }
  return normalized;
}

export function assertXlsxImportRowCount(count) {
  if (!Number.isSafeInteger(count) || count > MAX_IMPORT_ROWS + 1 || count < 0) {
    throw new TypeError('XLSX_TOO_MANY_ROWS');
  }
  return count;
}

export function assertXlsxCellValue(value) {
  const normalized = String(value ?? '');
  if (normalized.length > MAX_IMPORT_CELL_LENGTH) {
    throw new TypeError('XLSX_CELL_TOO_LONG');
  }
  return normalized;
}

export function assertXlsxWorksheetTarget(value) {
  if (typeof value !== 'string' || value.length > 240 || !value ||
      /[\\?#:\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('XLSX_SHEET_TARGET_INVALID');
  }
  const target = value.startsWith('/') ? value.slice(1) : `xl/${value.replace(/^\.\//, '')}`;
  const path = target.split('/');
  if (path.some(segment => !segment || segment === '.' || segment === '..') ||
      !/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/iu.test(target)) {
    throw new TypeError('XLSX_SHEET_TARGET_INVALID');
  }
  return target;
}

export function isXlsxPreviewXmlPart(path) {
  return path === 'xl/sharedStrings.xml' || path === 'xl/workbook.xml' ||
    path === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/u.test(path);
}

export function xlsxSharedString(value, shared) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value) ||
      !Array.isArray(shared)) {
    throw new TypeError('XLSX_SHARED_STRING_INVALID');
  }
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index >= shared.length) {
    throw new TypeError('XLSX_SHARED_STRING_INVALID');
  }
  return assertXlsxCellValue(shared[index]);
}
