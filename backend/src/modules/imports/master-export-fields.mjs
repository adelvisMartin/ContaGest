/** #770: fixed export schema; excludes ledgers, balances, secrets and internal IDs. */
export const MASTER_EXPORT_COLUMNS = Object.freeze({
  clients: Object.freeze(['rif', 'name', 'contact', 'email', 'phone', 'address', 'fiscalType']),
  suppliers: Object.freeze(['rif', 'name', 'contact', 'email', 'phone', 'address', 'retentionProfile']),
  inventory: Object.freeze(['sku', 'name', 'description', 'unit', 'cost', 'price', 'minStock', 'taxRate', 'barcode']),
  accounts: Object.freeze(['code', 'name', 'type', 'nature', 'level', 'parentCode', 'allowPosting', 'description'])
});

export function projectMasterExportRows(type, records) {
  const columns = MASTER_EXPORT_COLUMNS[type];
  if (!columns || !Array.isArray(records) || records.length > 500) {
    throw new TypeError('MASTER_EXPORT_INVALID_INPUT');
  }
  return records.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError('MASTER_EXPORT_INVALID_RECORD');
    }
    return Object.fromEntries(columns.map((column) => {
      const value = record[column];
      if (value === null || value === undefined) return [column, ''];
      if (typeof value === 'string' || typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))) {
        return [column, String(value)];
      }
      // Prisma.Decimal is the only object expected from the selected columns.
      if (typeof value === 'object' && value?.constructor?.name === 'Decimal' &&
          typeof value.toString === 'function') {
        return [column, value.toString()];
      }
      throw new TypeError('MASTER_EXPORT_UNSUPPORTED_VALUE');
    }));
  });
}
