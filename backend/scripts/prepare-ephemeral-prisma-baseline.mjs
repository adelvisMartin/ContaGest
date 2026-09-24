#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const EPHEMERAL_DB_PATTERN = /(_e2e|_drill|_restore)$/;
const BASELINE_MIGRATION = '0001_init';
const REQUIRED_BASELINE_TABLES = ['Tenant','UserProfile','LedgerEntry','LicenseKey','RegulatoryFeed'];

function databaseName(rawUrl) {
  const url = new URL(rawUrl);
  return decodeURIComponent(url.pathname.replace(/^\//,''));
}

function prismaBin() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

async function main() {
  const rawUrl = String(process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || '').trim();
  if (!rawUrl) {
    console.log('[prisma-baseline] no database URL; skipping ephemeral baseline detection');
    return;
  }

  const dbName = databaseName(rawUrl);
  if (!EPHEMERAL_DB_PATTERN.test(dbName)) {
    console.log(`[prisma-baseline] database ${dbName} is not ephemeral; no baseline mutation performed`);
    return;
  }

  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const tableCheck = await client.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public'
          and c.relkind in ('r','p')
          and c.relname = any($1::text[])`,
      [REQUIRED_BASELINE_TABLES],
    );
    const present = new Set(tableCheck.rows.map((row) => String(row.relname)));
    const missing = REQUIRED_BASELINE_TABLES.filter((name) => !present.has(name));
    if (missing.length === REQUIRED_BASELINE_TABLES.length) {
      console.log('[prisma-baseline] application baseline is absent; Prisma will own initialization');
      return;
    }
    if (missing.length > 0) {
      throw new Error(`EPHEMERAL_BASELINE_INCOMPLETE:${missing.join(',')}`);
    }

    const migrationTable = await client.query(
      `select to_regclass('public."_prisma_migrations"') as name`,
    );
    let alreadyApplied = false;
    if (migrationTable.rows[0]?.name) {
      const migration = await client.query(
        `select 1
           from public."_prisma_migrations"
          where migration_name=$1
            and finished_at is not null
            and rolled_back_at is null
          limit 1`,
        [BASELINE_MIGRATION],
      );
      alreadyApplied = migration.rowCount > 0;
    }

    if (alreadyApplied) {
      console.log(`[prisma-baseline] ${BASELINE_MIGRATION} already recorded`);
      return;
    }
  } finally {
    await client.end();
  }

  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`[prisma-baseline] recording ${BASELINE_MIGRATION} for ephemeral baseline ${dbName}`);
  execFileSync(
    prismaBin(),
    ['prisma','migrate','resolve','--applied',BASELINE_MIGRATION,'--schema','prisma/schema.prisma'],
    { cwd: backendRoot, stdio:'inherit', env:process.env },
  );
}

main().catch((error) => {
  console.error('[prisma-baseline] failed closed:', error instanceof Error ? error.message : String(error));
  process.exitCode=1;
});
