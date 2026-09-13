import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { buildXlsxWorkbook, XLSX_LIMITS, XlsxLimitError } from './xlsx-writer.js';

function zipEntries(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034B50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('internal XLSX writer emits deterministic OpenXML with safe inline strings', () => {
  const input = {
    title: 'ContaGest QA',
    sheets: [
      { name: "'Ventas / QA'", rows: [{ Cliente: 'Cliente QA', Monto: 123.45, Formula: '=2+2', Unsafe: '\u0000control' }] },
      { name: "'Ventas / QA'", rows: [] },
    ],
  };
  const first = buildXlsxWorkbook(input);
  const second = buildXlsxWorkbook(input);
  assert.deepEqual(first, second, 'same input must produce byte-identical XLSX evidence');
  assert.equal(Buffer.from(first).readUInt32LE(0), 0x04034B50, 'XLSX must start with a ZIP local-file header');

  const entries = zipEntries(first);
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.equal(entries.has(required), true, `missing ${required}`);
  }
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  assert.match(workbook, /name="Ventas  QA"/);
  assert.match(workbook, /name="Ventas  QA \(2\)"/);
  const sheet = entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') || '';
  assert.match(sheet, /t="inlineStr"/);
  assert.match(sheet, /=2\+2/);
  assert.doesNotMatch(sheet, /<f>/, 'user strings must never become spreadsheet formulas');
  assert.doesNotMatch(sheet, /\u0000/, 'invalid XML control characters must be stripped');
});

test('internal XLSX writer handles the #157 1000-row export shape without ExcelJS', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: index,
    name: `Synthetic row ${index}`,
    amount: (index + 1) / 100,
    status: 'active',
  }));
  const bytes = buildXlsxWorkbook({ title: 'Synthetic performance export', sheets: [{ name: 'QA', rows }] });
  assert.ok(bytes.length > 1_000, 'XLSX payload must not be empty');
  const entries = zipEntries(bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') || '';
  assert.match(sheet, /Synthetic row 999/);
  assert.match(sheet, /A1002/);
});

test('internal XLSX writer fails closed when resource limits are exceeded', () => {
  assert.throws(
    () => buildXlsxWorkbook({ sheets: Array.from({ length: XLSX_LIMITS.maxSheets + 1 }, (_, index) => ({ name: `S${index}`, rows: [] })) }),
    (error: unknown) => error instanceof XlsxLimitError && error.code === 'XLSX_EXPORT_LIMIT_EXCEEDED',
  );
  const tooWide = Object.fromEntries(Array.from({ length: XLSX_LIMITS.maxColumns + 1 }, (_, index) => [`c${index}`, index]));
  assert.throws(() => buildXlsxWorkbook({ sheets: [{ name: 'Wide', rows: [tooWide] }] }), XlsxLimitError);
});
