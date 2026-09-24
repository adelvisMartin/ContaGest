import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

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
  const result = spawnSync('npx', ['prisma', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

async function prepareLegacyBaseline(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const requiredTables = ['Tenant', 'UserProfile', 'Product', 'AnalyticsEvent', 'FoodOrder'];
    const rows = await client.query(
      `select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[])`,
      [requiredTables]
    );
    const present = new Set(rows.rows.map((row) => String(row.table_name)));
    const missing = requiredTables.filter((name) => !present.has(name));
    if (missing.length) {
      throw new Error(`[prisma-baseline] Base efímera sin baseline v8.5 completo: faltan ${missing.join(', ')}.`);
    }

    const migrationTable = await client.query(
      `select to_regclass('public."_prisma_migrations"')::text as name`
    );
    const applied = new Set();
    if (migrationTable.rows[0]?.name) {
      const result = await client.query(
        `select migration_name from "_prisma_migrations" where rolled_back_at is null`
      );
      for (const row of result.rows) applied.add(String(row.migration_name));
    }

    return LEGACY_BASELINE_MIGRATIONS.filter((name) => !applied.has(name));
  } finally {
    await client.end();
  }
}

export async function deployMigrations() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('[prisma-deploy] DATABASE_URL es obligatoria.');
  }

  if (isEphemeralDatabase(databaseUrl)) {
    const pendingBaseline = await prepareLegacyBaseline(databaseUrl);
    for (const migration of pendingBaseline) {
      console.log(`[prisma-baseline] Marcando baseline histórico aplicado: ${migration}`);
      runPrisma(['migrate', 'resolve', '--applied', migration]);
    }
  }

  runPrisma(['migrate', 'deploy']);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  deployMigrations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
