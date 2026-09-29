import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  DATA_LIFECYCLE_MIGRATION,
  inspectHistoricalCompatibility,
  projectHistoricalCompatibility
} from './migration-compat-v626.mjs';

const { Client } = pg;

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

async function assertCompatibilityMigrationIsTerminal(migrationsRoot) {
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const index = entries.indexOf(DATA_LIFECYCLE_MIGRATION);
  if (index < 0) throw new Error(`MISSING_PREREQUISITE:${DATA_LIFECYCLE_MIGRATION}`);
  if (index !== entries.length - 1) {
    throw new Error(
      `MIGRATION_ORDER_INVALID:${DATA_LIFECYCLE_MIGRATION}:ephemeral-projection-must-be-terminal:` +
      `next=${entries[index + 1]}`
    );
  }
}

export async function deployMigrations({ schemaPath = 'prisma/schema.prisma' } = {}) {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED_FOR_PRISMA_DEPLOY');

  let compatibilityStatus = null;
  let migrationsRoot = path.resolve(process.cwd(), path.dirname(schemaPath), 'migrations');

  if (isEphemeralDatabase(databaseUrl)) {
    for (const migration of await pendingLegacyBaseline(databaseUrl)) {
      console.log(`[prisma-baseline] recording historical baseline: ${migration}`);
      runPrisma(['migrate', 'resolve', '--applied', migration, '--schema', schemaPath]);
    }

    await assertCompatibilityMigrationIsTerminal(migrationsRoot);
    compatibilityStatus = await inspectHistoricalCompatibility({ databaseUrl });
    if (compatibilityStatus.requiresProjection && !compatibilityStatus.applied) {
      console.log(`[prisma-compat] reserving immutable historical migration: ${DATA_LIFECYCLE_MIGRATION}`);
      runPrisma(['migrate', 'resolve', '--applied', DATA_LIFECYCLE_MIGRATION, '--schema', schemaPath]);
    }
  }

  runPrisma(['migrate', 'deploy', '--schema', schemaPath]);

  if (isEphemeralDatabase(databaseUrl) && compatibilityStatus?.requiresProjection) {
    console.log(`[prisma-compat] projecting TEXT tenant compatibility: ${DATA_LIFECYCLE_MIGRATION}`);
    await projectHistoricalCompatibility({ databaseUrl, migrationsRoot });
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  deployMigrations().catch((error) => {
    console.error('[prisma-deploy]', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
