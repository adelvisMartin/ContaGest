// Strict delimited-text parser for the import preview. No file or DB writes.
const MAX_COLUMNS = 128;
const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 8192;

export function parseDelimitedImport(text, delimiter = ',') {
  if (typeof text !== 'string' || (delimiter !== ',' && delimiter !== '\t')) {
    throw new TypeError('IMPORT_DELIMITED_INPUT_INVALID');
  }
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = [];
  let row = [], cell = '', inQuotes = false, afterQuote = false, atStart = true;

  const flushCell = () => {
    if (row.length >= MAX_COLUMNS) throw new TypeError('IMPORT_DELIMITED_TOO_MANY_COLUMNS');
    row.push(cell);
    cell = '';
    atStart = true;
    afterQuote = false;
  };
  const flushRow = () => {
    flushCell();
    if (row.some(value => value.trim() !== '')) {
      if (records.length > MAX_ROWS) throw new TypeError('IMPORT_DELIMITED_TOO_MANY_ROWS');
      records.push(row);
    }
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; afterQuote = true; }
      } else cell += ch;
    } else if (ch === '"') {
      if (!atStart || afterQuote) throw new TypeError('IMPORT_DELIMITED_MALFORMED_QUOTES');
      inQuotes = true;
      atStart = false;
    } else if (ch === delimiter) {
      flushCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      flushRow();
    } else {
      if (afterQuote) throw new TypeError('IMPORT_DELIMITED_MALFORMED_QUOTES');
      cell += ch;
      atStart = false;
    }
    if (cell.length > MAX_CELL_LENGTH) throw new TypeError('IMPORT_DELIMITED_CELL_TOO_LONG');
  }
  if (inQuotes) throw new TypeError('IMPORT_DELIMITED_MALFORMED_QUOTES');
  if (cell.length || row.length || afterQuote) flushRow();
  if (!records.length) throw new TypeError('IMPORT_DELIMITED_HEADERS_INVALID');
  const headers = records.shift().map(value => value.trim());
  if (headers.some(value => !value) || new Set(headers.map(h => h.toLowerCase())).size !== headers.length) {
    throw new TypeError('IMPORT_DELIMITED_HEADERS_INVALID');
  }
  return records.map(values => {
    if (values.length !== headers.length) throw new TypeError('IMPORT_DELIMITED_COLUMN_COUNT');
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}
