import os from 'node:os';
import path from 'node:path';
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  DATA_LIFECYCLE_MIGRATION,
  inspectHistoricalCompatibility,
  projectHistoricalCompatibility
} from './migration-compat-v626.mjs';
import {
  COMPOSITE_TENANT_MIGRATION,
  inspectCompositeTenantCompatibility,
  projectCompositeTenantCompatibility
} from './migration-compat-v634.mjs';
import { planHistoricalProjection } from './migration-compat-plan-v626.mjs';

const { Client } = pg;
const RECORDED_ORDER_MIGRATION = '20261119144500_hipico_domain_recorded_order_index';
const RECORDED_ORDER_SHA256 = '119e54b3ef51500c8270d6b7d662b6bb36d58dc1622c0d0d0f0f443ddd0c99d9';

export const EPHEMERAL_DATABASE_PATTERN = /(_e2e|_drill|_restore)$/;
export const LEGACY_BASELINE_MIGRATIONS = Object.freeze([
  '0001_init',
  '0003_accounting_hr_fiscal_hardening',
  '0004_analytics_qr_barcode',
  '0005_food_orders_notifications_ai_demo'
]);

export function databaseNameFromUrl(rawUrl = '') {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

export function isEphemeralDatabase(rawUrl = '') {
  return EPHEMERAL_DATABASE_PATTERN.test(databaseNameFromUrl(rawUrl));
}

function runPrisma(args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['prisma', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PRISMA_COMMAND_FAILED:${args.join(' ')}:${result.status}`);
}

// #849/#751 are SQL-format corrections to historical migration files. Prisma
// deploy is not proof that an already-applied checksum matches the deployed
// source. Never silently bless drift on a customer database.
export const REVIEWED_HISTORICAL_SQL_REPAIRS = Object.freeze([
  '20261022171000_issue_849_service_catalog_foundation',
  '20261022173000_issue_751_reviewed_fiscal_rule_governance',
  RECORDED_ORDER_MIGRATION
]);

export async function assertReviewedMigrationChecksums({ databaseUrl, migrationsRoot }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const exists = await client.query(
      `SELECT to_regclass('public."_prisma_migrations"') AS migration_table`
    );
    if (!exists.rows[0]?.migration_table) return;
    const applied = await client.query(
      `SELECT migration_name, checksum
       FROM public."_prisma_migrations"
       WHERE migration_name = ANY($1::text[])
         AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      [REVIEWED_HISTORICAL_SQL_REPAIRS]
    );
    for (const row of applied.rows) {
      const migrationName = String(row.migration_name);
      const migrationPath = path.join(migrationsRoot, migrationName, 'migration.sql');
      const canonical = createHash('sha256')
        .update(await readFile(migrationPath)).digest('hex');
      if (!row.checksum || String(row.checksum).toLowerCase() !== canonical) {
        throw new Error(`HISTORICAL_MIGRATION_CHECKSUM_DRIFT:${migrationName}:DBA_REVIEW_REQUIRED`);
      }
    }
  } finally {
    await client.end();
  }
}

async function pendingLegacyBaseline(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const requiredTables = ['Tenant', 'UserProfile', 'Product', 'AnalyticsEvent', 'FoodOrder'];
    const rows = await client.query(
      `select table_name
         from information_schema.tables
        where table_schema='public'
          and table_name = any($1::text[])`,
      [requiredTables]
    );
    const present = new Set(rows.rows.map((row) => String(row.table_name)));
    const missing = requiredTables.filter((name) => !present.has(name));
    if (missing.length) {
      throw new Error(`EPHEMERAL_BASELINE_INCOMPLETE:${missing.join(',')}`);
    }

    const migrationTable = await client.query(
      `select to_regclass('public."_prisma_migrations"')::text as name`
    );
    if (!migrationTable.rows[0]?.name) return [...LEGACY_BASELINE_MIGRATIONS];

    const result = await client.query(
      `select migration_name
         from public."_prisma_migrations"
        where rolled_back_at is null
          and finished_at is not null`
    );
    const applied = new Set(result.rows.map((row) => String(row.migration_name)));
    return LEGACY_BASELINE_MIGRATIONS.filter((name) => !applied.has(name));
  } finally {
    await client.end();
  }
}

async function migrationProjectionState(migrationsRoot, migrationName) {
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return { ...planHistoricalProjection(entries, migrationName), entries };
}

async function createCompatibilityPrefixSchema(schemaPath, migrationsRoot, migrationNames) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'contagest-compat-prefix-'));
  const prismaRoot = path.join(root, 'prisma');
  const targetMigrations = path.join(prismaRoot, 'migrations');
  await mkdir(targetMigrations, { recursive: true });
  await cp(path.resolve(process.cwd(), schemaPath), path.join(prismaRoot, 'schema.prisma'));

  for (const migration of migrationNames) {
    await cp(path.join(migrationsRoot, migration), path.join(targetMigrations, migration), { recursive: true });
  }

  try {
    await copyFile(path.join(migrationsRoot, 'migration_lock.toml'), path.join(targetMigrations, 'migration_lock.toml'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return { root, schemaPath: path.join(prismaRoot, 'schema.prisma') };
}

async function deployPrefix({ schemaPath, migrationsRoot, migrationNames, label }) {
  if (migrationNames.length === 0) return null;
  const prefix = await createCompatibilityPrefixSchema(schemaPath, migrationsRoot, migrationNames);
  console.log(`[prisma-compat] deploying ${migrationNames.length} migrations before ${label}`);
  runPrisma(['migrate', 'deploy', '--schema', prefix.schemaPath]);
  return prefix;
}

// Only a disposable loopback database may use the reviewed compatibility path.
function isLocalEphemeralPair(databaseUrl, directUrl) {
  try {
    const a = new URL(databaseUrl), b = new URL(directUrl);
    const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
    return isEphemeralDatabase(databaseUrl) && isEphemeralDatabase(directUrl)
      && loopback.has(a.hostname) && a.hostname === b.hostname
      && (a.port || '5432') === (b.port || '5432')
      && databaseNameFromUrl(databaseUrl) === databaseNameFromUrl(directUrl)
      && (a.searchParams.get('schema') || 'public') === 'public'
      && (b.searchParams.get('schema') || 'public') === 'public';
  } catch { return false; }
}

async function executeRecordedOrderMigration({ databaseUrl, schemaPath, migrationsRoot, temporaryPrefixes }) {
  const state = await migrationProjectionState(migrationsRoot, RECORDED_ORDER_MIGRATION);
  if (!state.available) return;
  const original = await readFile(path.join(migrationsRoot, RECORDED_ORDER_MIGRATION, 'migration.sql'), 'utf8');
  if (createHash('sha256').update(original).digest('hex') !== RECORDED_ORDER_SHA256) {
    throw new Error('RECORDED_ORDER_MIGRATION_SOURCE_DRIFT');
  }
  const boundary = original.indexOf('\nDO $\n');
  if (boundary < 0) throw new Error('RECORDED_ORDER_MIGRATION_BOUNDARY_INVALID');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // This is not Prisma's migration lock. It protects this exact compatibility
    // operation between cooperative local test runners.
    const lock = await client.query('SELECT pg_try_advisory_lock(1391, 837) AS acquired');
    if (!lock.rows[0]?.acquired) throw new Error('RECORDED_ORDER_MIGRATION_BUSY');
    const table = await client.query(`SELECT to_regclass('public."_prisma_migrations"') AS migration_table`);
    const records = table.rows[0]?.migration_table
      ? await client.query(`SELECT checksum, finished_at FROM public."_prisma_migrations"
        WHERE migration_name=$1 AND rolled_back_at IS NULL`, [RECORDED_ORDER_MIGRATION])
      : { rows: [] };
    if (records.rows.some(row => !row.finished_at)) {
      throw new Error('RECORDED_ORDER_MIGRATION_FAILED_HISTORY_REQUIRES_REVIEW');
    }
    if (records.rows.length) {
      if (records.rows.length !== 1 || records.rows[0].checksum !== RECORDED_ORDER_SHA256) {
        throw new Error('RECORDED_ORDER_MIGRATION_HISTORY_DRIFT');
      }
      await client.query(original.slice(boundary)); // Check physical index even on retry.
      return;
    }

    const prefix = await deployPrefix({
      schemaPath, migrationsRoot, migrationNames: state.before, label: RECORDED_ORDER_MIGRATION
    });
    if (prefix) temporaryPrefixes.push(prefix);
    // PostgreSQL rejects CREATE INDEX CONCURRENTLY in a multi-statement query.
    // Execute the exact immutable DDL and its exact assertion in separate calls,
    // without BEGIN/COMMIT and without rewriting or projecting the original SQL.
    await client.query(original.slice(0, boundary));
    await client.query(original.slice(boundary));
    // Record only after the original physical validation has succeeded.
    runPrisma(['migrate', 'resolve', '--applied', RECORDED_ORDER_MIGRATION, '--schema', schemaPath]);
    console.log('[prisma-compat] verified concurrent index and recorded immutable migration');
  } finally {
    await client.end();
  }
}

export async function deployMigrations({ schemaPath = 'prisma/schema.prisma' } = {}) {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED_FOR_PRISMA_DEPLOY');

  const ephemeral = isEphemeralDatabase(databaseUrl);
  const migrationsRoot = path.resolve(process.cwd(), path.dirname(schemaPath), 'migrations');
  const temporaryPrefixes = [];

  try {
    // Check for already-applied historical migration drift BEFORE any baseline
    // resolve, compatibility projection, or schema mutation, even on ephemeral DBs.
    await assertReviewedMigrationChecksums({ databaseUrl, migrationsRoot });
    if (ephemeral) {
      for (const migration of await pendingLegacyBaseline(databaseUrl)) {
        console.log(`[prisma-baseline] recording historical baseline: ${migration}`);
        runPrisma(['migrate', 'resolve', '--applied', migration, '--schema', schemaPath]);
      }

      const lifecycle = await migrationProjectionState(migrationsRoot, DATA_LIFECYCLE_MIGRATION);
      if (lifecycle.available) {
        let lifecycleStatus = await inspectHistoricalCompatibility({ databaseUrl });
        if (lifecycleStatus.requiresProjection && !lifecycleStatus.applied) {
          const prefix = await deployPrefix({
            schemaPath,
            migrationsRoot,
            migrationNames: lifecycle.before,
            label: DATA_LIFECYCLE_MIGRATION,
          });
          if (prefix) temporaryPrefixes.push(prefix);

          console.log(`[prisma-compat] reserving immutable historical migration: ${DATA_LIFECYCLE_MIGRATION}`);
          runPrisma(['migrate', 'resolve', '--applied', DATA_LIFECYCLE_MIGRATION, '--schema', schemaPath]);

          console.log(`[prisma-compat] projecting TEXT tenant compatibility: ${DATA_LIFECYCLE_MIGRATION}`);
          await projectHistoricalCompatibility({ databaseUrl, migrationsRoot });
          lifecycleStatus = await inspectHistoricalCompatibility({ databaseUrl });
          if (!lifecycleStatus.applied || !lifecycleStatus.complete) {
            throw new Error(`MIGRATION_APPLY_FAILED:${DATA_LIFECYCLE_MIGRATION}:projection-not-complete`);
          }
        }
      }

      const composite = await migrationProjectionState(migrationsRoot, COMPOSITE_TENANT_MIGRATION);
      if (composite.available) {
        let compositeStatus = await inspectCompositeTenantCompatibility({ databaseUrl });
        if (compositeStatus.requiresProjection && !compositeStatus.applied) {
          const prefix = await deployPrefix({
            schemaPath,
            migrationsRoot,
            migrationNames: composite.before,
            label: COMPOSITE_TENANT_MIGRATION,
          });
          if (prefix) temporaryPrefixes.push(prefix);

          console.log(`[prisma-compat] reserving immutable historical migration: ${COMPOSITE_TENANT_MIGRATION}`);
          runPrisma(['migrate', 'resolve', '--applied', COMPOSITE_TENANT_MIGRATION, '--schema', schemaPath]);

          console.log(`[prisma-compat] projecting policy-bounded tenant guards: ${COMPOSITE_TENANT_MIGRATION}`);
          await projectCompositeTenantCompatibility({ databaseUrl });
          compositeStatus = await inspectCompositeTenantCompatibility({ databaseUrl });
          if (!compositeStatus.applied || !compositeStatus.complete) {
            throw new Error(`MIGRATION_APPLY_FAILED:${COMPOSITE_TENANT_MIGRATION}:projection-not-complete`);
          }
        }
      }
    }

    if (isLocalEphemeralPair(databaseUrl, String(process.env.DIRECT_DATABASE_URL || '').trim())) {
      await executeRecordedOrderMigration({ databaseUrl, schemaPath, migrationsRoot, temporaryPrefixes });
    }
    runPrisma(['migrate', 'deploy', '--schema', schemaPath]);
  } finally {
    for (const prefix of temporaryPrefixes) {
      if (prefix?.root) await rm(prefix.root, { recursive: true, force: true });
    }
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  deployMigrations().catch((error) => {
    console.error('[prisma-deploy]', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
