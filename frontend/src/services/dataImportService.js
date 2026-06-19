export const IMPORT_TEMPLATES = {
  inventory: ['sku','name','category','stock','reserved','min','costUsd','priceUsd','barcode'],
  clients: ['name','rif','email','phone','type','address'],
  suppliers: ['name','rif','email','phone','category','address'],
  accounts: ['code','name','type','nature','level','parentCode','allowPosting'],
  payroll: ['employee','idNumber','salary','days','overtimeHours','bonus','deductionsExtra']
};

function parseCsv(text, delimiter = ',') {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '')));
  const headers = rows.shift() || [];
  return rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
}

function normalizeRecord(record, type) {
  const numericByType = { inventory: ['stock','reserved','min','costUsd','priceUsd'], payroll: ['salary','days','overtimeHours','bonus','deductionsExtra'], accounts: ['level'] };
  for (const key of numericByType[type] || []) if (record[key] !== undefined) record[key] = Number(String(record[key]).replace(',', '.')) || 0;
  if (type === 'accounts') record.allowPosting = String(record.allowPosting).toLowerCase() !== 'false';
  return record;
}

export const DataImportService = {
  async parseFile(file, type) {
    const name = file.name.toLowerCase();
    const text = await file.text();
    let rows = [];
    if (name.endsWith('.json')) rows = JSON.parse(text);
    else rows = parseCsv(text, name.endsWith('.tsv') || name.endsWith('.txt') ? '\t' : ',');
    if (!Array.isArray(rows)) throw new Error('El archivo debe contener una lista de registros.');
    return rows.map((r) => normalizeRecord({ ...r }, type));
  },
  validateRows(rows, type) {
    const required = IMPORT_TEMPLATES[type] || [];
    return rows.map((row, index) => {
      const missing = required.filter((field) => row[field] === undefined || row[field] === '');
      return { index: index + 1, ok: missing.length === 0, missing, row };
    });
  },
  buildTemplateCsv(type) {
    return (IMPORT_TEMPLATES[type] || []).join(',') + '\n';
  }
};
