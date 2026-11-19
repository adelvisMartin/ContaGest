import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { xlsxColumnIndex, assertXlsxHeaders, assertXlsxImportRowCount, assertXlsxCellValue, assertXlsxWorksheetTarget, isXlsxPreviewXmlPart, xlsxSharedString } from '../frontend/src/services/xlsxImportGuards.mjs';

test('#770 XLSX row and column references have bounded exact syntax', () => {
  assert.equal(xlsxColumnIndex('A1'), 0);
  assert.equal(xlsxColumnIndex('D15'), 3);
  assert.equal(xlsxColumnIndex('DX5001'), 127);
  for (const ref of ['ZZZZZZZ1', 'XFD1', 'A0', 'A1048577', 'A-1', 'A1-extra', '123', null, '', 'A99999999', 'ABC1']) {
    assert.throws(() => xlsxColumnIndex(ref), /XLSX_(COLUMN_LIMIT|CELL_REFERENCE_INVALID)/);
  }
});
test('#770 XLSX headers reject duplicates and dangerous identifiers', () => {
  assert.deepEqual(assertXlsxHeaders([' sku ', 'Name']), ['sku', 'Name']);
  for (const headers of [['SKU', 'sku'], ['name', ''], ['__proto__', 'sku'], ['constructor'], [], ['a\u0000']]) {
    assert.throws(() => assertXlsxHeaders(headers), /XLSX_HEADERS_INVALID/);
  }
});
test('#770 workbook worksheet relations fail closed on external or ambiguous paths', () => {
  assert.equal(assertXlsxWorksheetTarget('worksheets/sheet2.xml'), 'xl/worksheets/sheet2.xml');
  assert.equal(assertXlsxWorksheetTarget('/xl/worksheets/sheet1.xml'), 'xl/worksheets/sheet1.xml');
  for (const target of ['../sheet1.xml', '../../evil.xml', 'http://example.com/a.xml', 'worksheets/../../bad.xml', '#fragment', 'worksheets/sheet1.xml?x=1']) {
    assert.throws(() => assertXlsxWorksheetTarget(target), /XLSX_SHEET_TARGET_INVALID/);
  }
});
test('#770 images embedded in XLSX never have their bytes decoded as XML', () => {
  assert.equal(isXlsxPreviewXmlPart('xl/worksheets/sheet2.xml'), true);
  assert.equal(isXlsxPreviewXmlPart('xl/sharedStrings.xml'), true);
  assert.equal(isXlsxPreviewXmlPart('xl/media/image1.jpeg'), false);
  assert.equal(isXlsxPreviewXmlPart('docProps/thumbnail.jpeg'), false);
});
test('#770 broken shared-string indexes never silently import empty strings', () => {
  assert.equal(xlsxSharedString('1', ['Header', 'Value']), 'Value');
  for (const value of ['-1', '9999', '0x1', '1.0', '1e3', undefined]) {
    assert.throws(() => xlsxSharedString(value, ['Header', 'Value']), /XLSX_SHARED_STRING_INVALID/);
  }
});
test('#770 XLSX preview enforces row and cell bounds', () => {
  assert.equal(assertXlsxImportRowCount(5001), 5001);
  assert.throws(() => assertXlsxImportRowCount(5002), /XLSX_TOO_MANY_ROWS/);
  assert.throws(() => assertXlsxCellValue('X'.repeat(8193)), /XLSX_CELL_TOO_LONG/);
});
test('#770 10k deterministic cell references never map outside allowed preview width', () => {
  for (let i = 0; i < 10000; i++) {
    const col = 1 + i % 256;
    let n = col, letters = '';
    while (n > 0) { n--; letters = String.fromCharCode(65 + n % 26) + letters; n = Math.floor(n / 26); }
    const reference = letters + (1 + i % 1_000_000);
    if (col <= 128) assert.equal(xlsxColumnIndex(reference), col - 1);
    else assert.throws(() => xlsxColumnIndex(reference), /XLSX_COLUMN_LIMIT/);
  }
});

test('#770 XLSX import service is wired to fail-closed preview guards', () => {
  const service=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
  assert.match(service,/xlsxColumnIndex\(cell\.getAttribute\('r'\)\)/);
  assert.match(service,/assertXlsxHeaders\(matrix\.shift\(\)\|\|\[\]\)/);
  assert.match(service,/assertXlsxImportRowCount\(sheetRows\.length\)/);
  assert.match(service,/isXlsxPreviewXmlPart\(name\)/);
  assert.match(service,/xlsxSharedString\(raw,shared\)/);
  assert.match(service,/assertXlsxWorksheetTarget\(relation\.getAttribute\('Target'\)\)/);
  assert.match(service,/if\(cell\.querySelector\('f'\)\)/);
});
