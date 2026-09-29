import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_DUPLICATE_TIMESTAMPS,
  ERROR_CODES,
  LEGACY_BASELINE_MIGRATIONS,
  assertEphemeralDatabase,
  migrationCatalogManifest,
  physicalSchemaHash,
  snapshotProvenanceHash,
  validateMigrationCatalog,
  validateSnapshot,
} from '../scripts/migration-chain/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('#626 exposes the complete error catalog', () => {
  for (const code of [
    'MIGRATION_APPLY_FAILED','MIGRATION_ORDER_INVALID','MIGRATION_DUPLICATE_AUTHORITY','MIGRATION_TYPE_MISMATCH',
    'UPGRADE_DIVERGENCE','FROM_ZERO_SCHEMA_MISMATCH','MISSING_PREREQUISITE','UNSAFE_PRODUCTION_COMMAND','SNAPSHOT_PROVENANCE_INVALID'
  ]) assert.ok(ERROR_CODES.includes(code), code);
});

test('#626 refuses production/shared database targets', () => {
  assert.throws(() => assertEphemeralDatabase('postgresql://u:p@db.example/contagest'), (error) => error.code === 'UNSAFE_PRODUCTION_COMMAND');
  assert.throws(() => assertEphemeralDatabase('postgresql://u:p@soxzatxiwlfsvtblrqal.supabase.co/contagest_e2e'), (error) => error.code === 'UNSAFE_PRODUCTION_COMMAND');
  assert.equal(assertEphemeralDatabase('postgresql://u:p@127.0.0.1:5432/contagest_migrations_e2e'), 'contagest_migrations_e2e');
});

test('#626 rejects unordered and unapproved duplicate authorities', () => {
  assert.throws(() => validateMigrationCatalog(['20260102000000_b','20260101000000_a']), (error) => error.code === 'MIGRATION_ORDER_INVALID');
  assert.throws(() => validateMigrationCatalog(['20260101000000_a','20260101000000_b']), (error) => error.code === 'MIGRATION_DUPLICATE_AUTHORITY');
  const approved = ALLOWED_DUPLICATE_TIMESTAMPS['20260927143000'];
  assert.equal(validateMigrationCatalog(approved).duplicates.length, 1);
});

test('#626 binds snapshot provenance to metadata, fixture content hash and a real migration boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg626-'));
  for (const [name, sql] of [['0001_init','select 1;'],['20260101000000_next','select 2;']]) {
    const dir = path.join(root, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'migration.sql'), sql);
  }
  const catalog = migrationCatalogManifest(root, ['0001_init','20260101000000_next']);
  const snapshot = {
    id: 'baseline',
    lastMigration: '0001_init',
    source: 'canonical-rebuild',
    createdFromRepoSha: 'abc',
    fixture: 'tests/fixture.sql',
    fixtureSha256: 'f'.repeat(64),
  };
  snapshot.provenanceSha256 = snapshotProvenanceHash(snapshot);
  assert.equal(validateSnapshot(snapshot, catalog), snapshot);
  assert.throws(() => validateSnapshot({ ...snapshot, fixtureSha256: '0'.repeat(64) }, catalog), (error) => error.code === 'SNAPSHOT_PROVENANCE_INVALID');
  assert.throws(() => validateSnapshot({ ...snapshot, provenanceSha256: '0'.repeat(64) }, catalog), (error) => error.code === 'SNAPSHOT_PROVENANCE_INVALID');
});

test('#626 physical manifest is deterministic and ignores equivalent owner aliases', () => {
  const a = { objects: [
    { kind:'table', schema:'public', name:'B', signature:{owner:'postgres'} },
    { kind:'table', schema:'public', name:'A', signature:{owner:'postgres'} },
  ]};
  const b = { objects: [
    { kind:'table', schema:'public', name:'A', signature:{owner:'supabase_admin'} },
    { kind:'table', schema:'public', name:'B', signature:{owner:'supabase_admin'} },
  ]};
  assert.equal(physicalSchemaHash(a), physicalSchemaHash(b));
});

test('#626 data lifecycle tenant references match Tenant TEXT authority', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql'), 'utf8');
  assert.equal((sql.match(/"tenantId"\s+uuid/gi) ?? []).length, 0);
  assert.equal((sql.match(/"tenantId"\s+text/gi) ?? []).length, 5);
  assert.match(sql, /p_tenant\s+text/i);
});

test('#626 fiscal duplicate timestamp is a documented no-op compatibility directory', () => {
  const noOp = fs.readFileSync(path.join(ROOT, 'backend/prisma/migrations/20260927143000_fiscal_engine_v561/migration.sql'), 'utf8');
  const executable = noOp.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.equal(executable, '');
  assert.deepEqual(ALLOWED_DUPLICATE_TIMESTAMPS['20260927143000'], [
    '20260927143000_fiscal_authority_v561',
    '20260927143000_fiscal_engine_v561',
  ]);
});

test('#626 historical bootstrap deltas are explicit and closed', () => {
  assert.deepEqual(LEGACY_BASELINE_MIGRATIONS, [
    '0001_init',
    '0003_accounting_hr_fiscal_hardening',
    '0004_analytics_qr_barcode',
    '0005_food_orders_notifications_ai_demo',
  ]);
});
