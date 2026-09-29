import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_BASELINE_MIGRATIONS,
  MigrationChainError,
  classifyApplyError,
  listMigrations,
  migrationCatalogManifest,
  validateMigrationCatalog,
  validateSnapshot,
} from './core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');
export const MIGRATIONS_DIR = path.join(ROOT, 'backend/prisma/migrations');
export const PREPARE_SQL = path.join(ROOT, 'ops/database/prepare-supabase-ephemeral.sql');

function resolveInclude(fromFile, target) {
  return path.resolve(path.dirname(fromFile), target.trim().replace(/^['"]|['"]$/g, ''));
}

export async function executePsqlCompatibleFile(client, filePath, seen = new Set()) {
  const canonical = fs.realpathSync(filePath);
  if (seen.has(canonical)) throw new MigrationChainError('MISSING_PREREQUISITE', `recursive SQL include: ${filePath}`);
  seen.add(canonical);
  const lines = fs.readFileSync(canonical, 'utf8').split(/\r?\n/);
  let chunk = [];
  const flush = async () => {
    const sql = chunk.join('\n').trim();
    chunk = [];
    if (sql) await client.query(sql);
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const include = /^\\ir?\s+(.+)$/.exec(trimmed);
    if (include) {
      await flush();
      await executePsqlCompatibleFile(client, resolveInclude(canonical, include[1]), seen);
      continue;
    }
    if (/^\\(?:set|echo)\b/.test(trimmed)) continue;
    if (/^\\/.test(trimmed)) throw new MigrationChainError('MISSING_PREREQUISITE', `unsupported psql meta-command in ${filePath}: ${trimmed}`);
    chunk.push(line);
  }
  await flush();
  seen.delete(canonical);
}

export async function resetEphemeralDatabase(client) {
  await client.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
  await client.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
  await client.query('DROP SCHEMA IF EXISTS storage CASCADE');
  await client.query('DROP SCHEMA IF EXISTS private CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');
}

export async function applyMigration(client, migrationDir, migrationName) {
  const file = path.join(migrationDir, migrationName, 'migration.sql');
  const sql = fs.readFileSync(file, 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw classifyApplyError(error, migrationName);
  }
}

export async function buildState(client, { through = null } = {}) {
  await resetEphemeralDatabase(client);
  await executePsqlCompatibleFile(client, PREPARE_SQL);
  const names = listMigrations(MIGRATIONS_DIR);
  validateMigrationCatalog(names);
  const boundary = through ? names.indexOf(through) : names.length - 1;
  if (boundary < 0) throw new MigrationChainError('SNAPSHOT_PROVENANCE_INVALID', `unknown migration boundary ${through}`);

  for (let i = 0; i <= boundary; i += 1) {
    const name = names[i];
    if (LEGACY_BASELINE_MIGRATIONS.includes(name)) continue;
    await applyMigration(client, MIGRATIONS_DIR, name);
  }
  return { names, lastMigration: names[boundary] };
}

export function loadSnapshotConfig() {
  const file = path.join(ROOT, 'config/migration-chain-snapshots.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const catalog = migrationCatalogManifest(MIGRATIONS_DIR);
  validateMigrationCatalog(catalog.migrations.map((entry) => entry.name));
  for (const snapshot of config.snapshots) validateSnapshot(snapshot, catalog);
  return { ...config, catalog };
}

export async function assertCriticalSchema(client) {
  const columns = await client.query(`
    select table_name, column_name, data_type
      from information_schema.columns
     where table_schema='public'
       and table_name in ('LedgerEntry','DataRetentionPolicyVersion','DataLegalHold','DataLifecycleJob','DataLifecycleEvidence','DataStorageObject')
       and column_name in ('postedAt','postedBy','reversalOfId','tenantId')
  `);
  const byKey = new Map(columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row.data_type]));
  for (const key of ['LedgerEntry.postedAt','LedgerEntry.postedBy','LedgerEntry.reversalOfId']) {
    if (!byKey.has(key)) throw new MigrationChainError('FROM_ZERO_SCHEMA_MISMATCH', `missing ledger lifecycle column ${key}`);
  }
  for (const table of ['DataRetentionPolicyVersion','DataLegalHold','DataLifecycleJob','DataLifecycleEvidence','DataStorageObject']) {
    const actual = byKey.get(`${table}.tenantId`);
    if (actual !== 'text') throw new MigrationChainError('MIGRATION_TYPE_MISMATCH', `${table}.tenantId expected text, got ${actual ?? 'missing'}`);
  }

  const tables = await client.query(`select table_name from information_schema.tables where table_schema='public'`);
  const tableSet = new Set(tables.rows.map((row) => row.table_name));
  for (const table of [
    'FinancialFxPolicy',
    'FinancialFxDocumentSnapshot',
    'FinancialFxLedgerLineSnapshot',
    'FinancialFxBankAccountMap',
    'FinancialFxEvent',
    'FiscalRuleVersion',
    'FiscalSequence',
    'FiscalDocumentRuleSnapshot',
    'FiscalCloseEvidence',
    'Permission',
    'RolePermission',
  ]) {
    if (!tableSet.has(table)) throw new MigrationChainError('FROM_ZERO_SCHEMA_MISMATCH', `missing critical table ${table}`);
  }

  const constraints = await client.query(`
    select c.conname
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
     where n.nspname='public'
  `);
  const constraintSet = new Set(constraints.rows.map((row) => row.conname));
  for (const name of [
    'FinancialFxPolicy_tenant_fkey',
    'FinancialFxLedgerLineSnapshot_line_fkey',
    'FinancialFxEvent_ledger_fkey',
  ]) {
    if (!constraintSet.has(name)) throw new MigrationChainError('FROM_ZERO_SCHEMA_MISMATCH', `missing critical FK ${name}`);
  }

  const triggers = await client.query(`
    select t.tgname
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
     where n.nspname='public' and not t.tgisinternal
  `);
  const triggerSet = new Set(triggers.rows.map((row) => row.tgname));
  for (const name of [
    'LedgerEntry_lifecycle_guard',
    'LedgerLine_posted_guard',
    'DataRetentionPolicyVersion_guard_trg',
    'DataLifecycleEvidence_immutable_trg',
  ]) {
    if (!triggerSet.has(name)) throw new MigrationChainError('FROM_ZERO_SCHEMA_MISMATCH', `missing critical trigger ${name}`);
  }
}

export function manifestEnvelope({ repoSha, catalog, snapshot, schemaHash, scenario }) {
  return {
    version: 1,
    ticket: 626,
    scenario,
    repoSha,
    migrationChainSha256: catalog.chainSha256,
    migrationCount: catalog.migrations.length,
    schemaSha256: schemaHash,
    postgresVersion: snapshot.metadata?.postgresVersion ?? null,
    postgresVersionNum: snapshot.metadata?.postgresVersionNum ?? null,
    generatedAt: new Date().toISOString(),
    physical: snapshot,
  };
}

export function compareSchemaHashes(expected, actual, scenario) {
  if (expected !== actual) {
    throw new MigrationChainError('UPGRADE_DIVERGENCE', `${scenario} final schema differs from from-zero`, { expected, actual });
  }
}
