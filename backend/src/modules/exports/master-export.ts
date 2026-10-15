import { createHash } from 'node:crypto';

export type MasterExportEntity = 'clients' | 'suppliers' | 'products';
export type MasterExportFormat = 'json' | 'csv';

export const MASTER_EXPORT_FIELDS: Readonly<Record<MasterExportEntity, readonly string[]>> = Object.freeze({
  clients: Object.freeze(['rif', 'name', 'contact', 'email', 'phone', 'address', 'fiscalType', 'active']),
  suppliers: Object.freeze(['rif', 'name', 'contact', 'email', 'phone', 'address', 'retentionProfile', 'active']),
  products: Object.freeze(['sku', 'name', 'description', 'unit', 'cost', 'price', 'minStock', 'taxRate', 'active'])
});

export function masterExportCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  // Decimal-like Prisma values must be stringified exactly; objects from
  // the caller may never become JSON/CSV fragments or arbitrary columns.
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const result = value.toString();
    if (/^-?\d+(?:\.\d+)?$/.test(result)) return result;
  }
  throw new TypeError('Unsupported master export cell');
}

export function masterExportRows(entity: MasterExportEntity, records: readonly Record<string, unknown>[]) {
  return records.map((record) =>
    Object.fromEntries(MASTER_EXPORT_FIELDS[entity].map((field) => [field, record[field] == null ? null : masterExportCell(record[field])]))
  );
}

export function masterExportCsv(entity: MasterExportEntity, rows: readonly Record<string, string | null>[]): string {
  const fields = MASTER_EXPORT_FIELDS[entity];
  const safe = (value: string | null) => {
    let text = value ?? '';
    // Any spreadsheet formula prefix (including leading whitespace and
    // control chars) must be escaped before RFC4180 quoting.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [fields.map(safe).join(','), ...rows.map((row) => fields.map((key) => safe(row[key] ?? null)).join(','))].join('\r\n');
}

export function masterExportPayload(entity: MasterExportEntity, format: MasterExportFormat,
  source: readonly Record<string, unknown>[], meta: { skip: number; take: number; hasMore: boolean; exportedAt: string }) {
  const rows = masterExportRows(entity, source);
  const data = format === 'csv' ? masterExportCsv(entity, rows) :
    JSON.stringify({ schemaVersion: 1, source: 'contagest:server', entity, ...meta, rows });
  const sha256 = createHash('sha256').update(data, 'utf8').digest('hex');
  return { data, sha256, count: rows.length, nextSkip: meta.hasMore ? meta.skip + rows.length : null };
}
