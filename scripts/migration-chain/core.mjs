import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ERROR_CODES = Object.freeze([
  'MIGRATION_APPLY_FAILED',
  'MIGRATION_ORDER_INVALID',
  'MIGRATION_DUPLICATE_AUTHORITY',
  'MIGRATION_TYPE_MISMATCH',
  'UPGRADE_DIVERGENCE',
  'FROM_ZERO_SCHEMA_MISMATCH',
  'MISSING_PREREQUISITE',
  'UNSAFE_PRODUCTION_COMMAND',
  'SNAPSHOT_PROVENANCE_INVALID',
]);

export const LEGACY_BASELINE_MIGRATIONS = Object.freeze([
  '0001_init',
  '0003_accounting_hr_fiscal_hardening',
  '0004_analytics_qr_barcode',
  '0005_food_orders_notifications_ai_demo',
]);

export const ALLOWED_DUPLICATE_TIMESTAMPS = Object.freeze({
  '20260927143000': [
    '20260927143000_fiscal_authority_v561',
    '20260927143000_fiscal_engine_v561',
  ],
});

export class MigrationChainError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'MigrationChainError';
    this.code = code;
    this.details = details;
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function databaseNameFromUrl(rawUrl = '') {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

export function assertEphemeralDatabase(rawUrl, { productionProjectRef = 'soxzatxiwlfsvtblrqal' } = {}) {
  if (!rawUrl) throw new MigrationChainError('MISSING_PREREQUISITE', 'DATABASE_URL is required');
  if (rawUrl.includes(productionProjectRef)) {
    throw new MigrationChainError('UNSAFE_PRODUCTION_COMMAND', 'production Supabase project is forbidden');
  }
  const name = databaseNameFromUrl(rawUrl);
  if (!/(_e2e|_drill|_restore)$/.test(name)) {
    throw new MigrationChainError('UNSAFE_PRODUCTION_COMMAND', `database ${name || '<invalid>'} is not ephemeral`);
  }
  return name;
}

export function migrationTimestamp(name) {
  const match = /^(\d{14})_/.exec(name);
  return match?.[1] ?? null;
}

export function listMigrations(migrationsDir) {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (!entries.length) throw new MigrationChainError('MISSING_PREREQUISITE', 'no Prisma migrations found');
  return entries;
}

export function validateMigrationCatalog(names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(names) !== JSON.stringify(sorted)) {
    throw new MigrationChainError('MIGRATION_ORDER_INVALID', 'migration list is not canonical lexicographic order');
  }
  const timestamps = new Map();
  for (const name of names) {
    const timestamp = migrationTimestamp(name);
    if (!timestamp) continue;
    const bucket = timestamps.get(timestamp) ?? [];
    bucket.push(name);
    timestamps.set(timestamp, bucket);
  }
  const duplicates = [];
  for (const [timestamp, values] of timestamps) {
    if (values.length < 2) continue;
    const allowed = ALLOWED_DUPLICATE_TIMESTAMPS[timestamp] ?? [];
    const same = values.length === allowed.length && values.every((value, i) => value === allowed[i]);
    if (!same) {
      throw new MigrationChainError('MIGRATION_DUPLICATE_AUTHORITY', `unapproved duplicate migration timestamp ${timestamp}`, { migrations: values });
    }
    duplicates.push({ timestamp, migrations: values, classification: 'APPROVED_COMPATIBILITY_PAIR' });
  }
  return { duplicates };
}

export function migrationCatalogManifest(migrationsDir, names = listMigrations(migrationsDir)) {
  const migrations = names.map((name) => {
    const file = path.join(migrationsDir, name, 'migration.sql');
    if (!fs.existsSync(file)) throw new MigrationChainError('MISSING_PREREQUISITE', `missing migration.sql for ${name}`);
    const sql = fs.readFileSync(file);
    return { name, sha256: sha256(sql), bytes: sql.byteLength };
  });
  return { migrations, chainSha256: sha256(JSON.stringify(migrations)) };
}

export function snapshotProvenanceHash(snapshot) {
  const canonical = {
    id: snapshot.id,
    lastMigration: snapshot.lastMigration,
    source: snapshot.source,
    createdFromRepoSha: snapshot.createdFromRepoSha,
    fixture: snapshot.fixture ?? null,
    fixtureSha256: snapshot.fixtureSha256 ?? null,
  };
  return sha256(JSON.stringify(canonical));
}

export function validateSnapshot(snapshot, catalog) {
  if (!snapshot?.id || !snapshot.lastMigration || !snapshot.provenanceSha256 || !snapshot.source || !snapshot.createdFromRepoSha || !snapshot.fixture || !snapshot.fixtureSha256) {
    throw new MigrationChainError('SNAPSHOT_PROVENANCE_INVALID', 'snapshot metadata is incomplete');
  }
  if (!catalog.migrations.some((entry) => entry.name === snapshot.lastMigration)) {
    throw new MigrationChainError('SNAPSHOT_PROVENANCE_INVALID', `snapshot migration not found: ${snapshot.lastMigration}`);
  }
  const actual = snapshotProvenanceHash(snapshot);
  if (actual !== snapshot.provenanceSha256) {
    throw new MigrationChainError('SNAPSHOT_PROVENANCE_INVALID', `snapshot ${snapshot.id} provenance hash does not match metadata`, { expected: snapshot.provenanceSha256, actual });
  }
  return snapshot;
}

export function stablePhysicalSnapshot(snapshot) {
  const objects = (snapshot?.objects ?? [])
    .filter((object) => !(object.schema === 'public' && object.name === '_prisma_migrations'))
    .map((object) => {
      const clone = structuredClone(object);
      if (clone.signature?.owner && ['postgres', 'supabase_admin'].includes(clone.signature.owner)) clone.signature.owner = '<db-owner>';
      return clone;
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { objects };
}

export function physicalSchemaHash(snapshot) {
  return sha256(JSON.stringify(stablePhysicalSnapshot(snapshot)));
}

export function classifyApplyError(error, migrationName) {
  const message = String(error?.message ?? error ?? '');
  const code = error?.code === '42804' || /incompatible types|type mismatch/i.test(message)
    ? 'MIGRATION_TYPE_MISMATCH'
    : 'MIGRATION_APPLY_FAILED';
  return new MigrationChainError(code, `migration ${migrationName} failed`, { dbCode: error?.code ?? null, cause: message.slice(0, 1000) });
}
