import { deflateRawSync } from 'node:zlib';

export const XLSX_LIMITS = Object.freeze({
  maxSheets: 12,
  maxRowsPerSheet: 25_000,
  maxColumns: 128,
  maxTotalCells: 500_000,
  maxCellChars: 32_767,
});

export type XlsxCellValue = unknown;
export type XlsxSheetInput = { name?: string; rows?: Record<string, XlsxCellValue>[] };
export type XlsxWorkbookInput = { title?: string; sheets?: XlsxSheetInput[] };

export class XlsxLimitError extends Error {
  readonly code = 'XLSX_EXPORT_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'XlsxLimitError';
  }
}

const encoder = new TextEncoder();
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, XLSX_LIMITS.maxCellChars);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try { return JSON.stringify(value).slice(0, XLSX_LIMITS.maxCellChars); }
    catch { return String(value).slice(0, XLSX_LIMITS.maxCellChars); }
  }
  return String(value).slice(0, XLSX_LIMITS.maxCellChars);
}

function headersFromRows(rows: Record<string, unknown>[]): string[] {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (headers.length > XLSX_LIMITS.maxColumns) {
    throw new XlsxLimitError(`XLSX column limit exceeded: ${headers.length} > ${XLSX_LIMITS.maxColumns}`);
  }
  return headers;
}

function safeSheetName(raw: string, used: Set<string>): string {
  const cleaned = String(raw || 'Datos').replace(/[\\/?*\[\]:]/g, '').trim().replace(/^'+|'+$/g, '').slice(0, 31) || 'Datos';
  let candidate = cleaned;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    const tail = ` (${suffix++})`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - tail.length))}${tail}`;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function cellXml(ref: string, value: unknown, style: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = textValue(value);
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function worksheetXml(title: string, rows: Record<string, unknown>[], headers: string[]): string {
  const widthCount = Math.max(headers.length, 1);
  const lastColumn = columnName(widthCount - 1);
  const cols = headers.map((header, index) => {
    const width = Math.min(Math.max(String(header).length + 8, 16), 42);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const titleCell = cellXml('A1', title, 1);
  const headerCells = headers.map((header, index) => cellXml(`${columnName(index)}2`, header, 2)).join('');
  const dataRows = rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 3;
    const cells = headers.map((header, columnIndex) => cellXml(`${columnName(columnIndex)}${excelRow}`, row[header] ?? '', 3)).join('');
    return `<row r="${excelRow}">${cells}</row>`;
  }).join('');
  const merge = widthCount > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>` : '';
  const autoFilterEnd = Math.max(2, rows.length + 2);
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData><row r="1" ht="26" customHeight="1">${titleCell}</row><row r="2">${headerCells}</row>${dataRows}</sheetData>${merge}<autoFilter ref="A2:${lastColumn}${autoFilterEnd}"/></worksheet>`;
}

function stylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Calibri"/></font><font><b/><color rgb="FF0F172A"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00236F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6DEE9"/></left><right style="thin"><color rgb="FFD6DEE9"/></right><top style="thin"><color rgb="FFD6DEE9"/></top><bottom style="thin"><color rgb="FFD6DEE9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function rootRelationshipsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames.map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xFF, (value >>> 8) & 0xFF);
}
function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF);
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

type ZipEntry = { name: string; data: string };
function zipStore(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.data);
    const compressed = new Uint8Array(deflateRawSync(data, { level: 6 }));
    const crc = crc32(data);
    const local = concat([
      u32(0x04034B50), u16(20), u16(0x0800), u16(8), u16(ZIP_DOS_TIME), u16(ZIP_DOS_DATE),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), name, compressed,
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(8), u16(ZIP_DOS_TIME), u16(ZIP_DOS_DATE),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = concat(centrals);
  const end = concat([
    u32(0x06054B50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralDirectory.length), u32(offset), u16(0),
  ]);
  return concat([...locals, centralDirectory, end]);
}

export function buildXlsxWorkbook(input: XlsxWorkbookInput): Uint8Array {
  const sheets = input.sheets?.length ? input.sheets : [{ name: 'Datos', rows: [] }];
  if (sheets.length > XLSX_LIMITS.maxSheets) {
    throw new XlsxLimitError(`XLSX sheet limit exceeded: ${sheets.length} > ${XLSX_LIMITS.maxSheets}`);
  }
  let totalCells = 0;
  const usedNames = new Set<string>();
  const prepared = sheets.map((sheet, index) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    if (rows.length > XLSX_LIMITS.maxRowsPerSheet) {
      throw new XlsxLimitError(`XLSX row limit exceeded on sheet ${index + 1}: ${rows.length} > ${XLSX_LIMITS.maxRowsPerSheet}`);
    }
    const headers = headersFromRows(rows);
    totalCells += Math.max(headers.length, 1) * Math.max(rows.length + 2, 2);
    if (totalCells > XLSX_LIMITS.maxTotalCells) {
      throw new XlsxLimitError(`XLSX total cell limit exceeded: ${totalCells} > ${XLSX_LIMITS.maxTotalCells}`);
    }
    return { name: safeSheetName(sheet.name || `Datos ${index + 1}`, usedNames), rows, headers };
  });
  const title = textValue(input.title || 'ContaGest-VE Export');
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: contentTypesXml(prepared.length) },
    { name: '_rels/.rels', data: rootRelationshipsXml() },
    { name: 'xl/workbook.xml', data: workbookXml(prepared.map((sheet) => sheet.name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelationshipsXml(prepared.length) },
    { name: 'xl/styles.xml', data: stylesXml() },
    ...prepared.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: worksheetXml(title, sheet.rows, sheet.headers) })),
  ];
  return zipStore(entries);
}
