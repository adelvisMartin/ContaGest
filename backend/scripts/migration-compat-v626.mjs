import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

export const DATA_LIFECYCLE_MIGRATION = '20260927152000_data_lifecycle_v562';
const DATA_LIFECYCLE_TABLES = Object.freeze([
  'DataRetentionPolicyVersion',
  'DataLegalHold',
  'DataLifecycleJob',
  'DataLifecycleEvidence',
  'DataStorageObject'
]);

// #562 was merged with UUID tenant references before Tenant.id was normalized to TEXT.
// Keep the historical migration immutable and project only the incompatible tenant boundary
// when replaying the chain on a disposable database.
const TENANT_COLUMN_UUID = /"tenantId"\s+uuid\b/g;
const TENANT_PARAM_UUID = /\bp_tenant\w*\s+uuid\b/g;

async function appliedMigration(client, migrationName) {
  const table = await client.query(`select to_regclass('public."_prisma_migrations"')::text as name`);
  if (!table.rows[0]?.name) return false;
  const result = await client.query(
    `select 1
       from public."_prisma_migrations"
      where migration_name = $1
        and rolled_back_at is null
        and finished_at is not null
      limit 1`,
    [migrationName]
  );
  return result.rowCount > 0;
}

async function tenantIdType(client) {
  const result = await client.query(
    `select data_type, udt_name
       from information_schema.columns
      where table_schema='public' and table_name='Tenant' and column_name='id'`
  );
  return result.rows[0] || null;
}

async function existingLifecycleTables(client) {
  const result = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema='public' and table_name = any($1::text[])
      order by table_name`,
    [DATA_LIFECYCLE_TABLES]
  );
  return result.rows.map((row) => String(row.table_name));
}

export function projectDataLifecycleSql(source) {
  let tenantColumnReplacements = 0;
  let tenantParameterReplacements = 0;

  const projected = source
    .replace(TENANT_COLUMN_UUID, (match) => {
      tenantColumnReplacements += 1;
      return match.replace(/uuid\b/, 'text');
    })
    .replace(TENANT_PARAM_UUID, (match) => {
      tenantParameterReplacements += 1;
      return match.replace(/uuid\b/, 'text');
    });

  if (tenantColumnReplacements < 5 || tenantParameterReplacements < 1) {
    throw new Error(
      `MIGRATION_TYPE_MISMATCH:${DATA_LIFECYCLE_MIGRATION}:expected-tenant-uuid-signatures:` +
      `columns=${tenantColumnReplacements}:params=${tenantParameterReplacements}`
    );
  }
  if (/"tenantId"\s+uuid\b/.test(projected) || /\bp_tenant\w*\s+uuid\b/.test(projected)) {
    throw new Error(`MIGRATION_TYPE_MISMATCH:${DATA_LIFECYCLE_MIGRATION}:uuid-tenant-signature-remains`);
  }
  return projected;
}

export async function projectHistoricalCompatibility({
  databaseUrl,
  migrationsRoot = path.resolve(process.cwd(), 'prisma', 'migrations')
}) {
  if (!databaseUrl) throw new Error('MISSING_PREREQUISITE:DATABASE_URL');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (await appliedMigration(client, DATA_LIFECYCLE_MIGRATION)) return [];

    const tenantType = await tenantIdType(client);
    if (!tenantType) throw new Error('MISSING_PREREQUISITE:public.Tenant.id');
    if (tenantType.data_type !== 'text' && tenantType.udt_name !== 'text') {
      throw new Error(
        `MIGRATION_TYPE_MISMATCH:public.Tenant.id:expected=text:actual=${tenantType.data_type || tenantType.udt_name}`
      );
    }

    const existing = await existingLifecycleTables(client);
    if (existing.length) {
      throw new Error(
        `MIGRATION_DUPLICATE_AUTHORITY:${DATA_LIFECYCLE_MIGRATION}:partial-or-untracked-tables=${existing.join(',')}`
      );
    }

    const migrationPath = path.join(migrationsRoot, DATA_LIFECYCLE_MIGRATION, 'migration.sql');
    let source;
    try {
      source = await readFile(migrationPath, 'utf8');
    } catch (error) {
      throw new Error(`MISSING_PREREQUISITE:${migrationPath}:${error instanceof Error ? error.message : String(error)}`);
    }
    const projected = projectDataLifecycleSql(source);

    await client.query('BEGIN');
    try {
      await client.query(projected);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `MIGRATION_APPLY_FAILED:${DATA_LIFECYCLE_MIGRATION}:${error instanceof Error ? error.message : String(error)}`
      );
    }

    return [DATA_LIFECYCLE_MIGRATION];
  } finally {
    await client.end();
  }
}
