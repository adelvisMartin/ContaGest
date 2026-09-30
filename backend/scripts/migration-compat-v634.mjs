import path from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { buildMigration, expandPolicy, guardNames, validatePolicy } from '../../scripts/composite-tenant-integrity-v634.mjs';

const { Client } = pg;

export const COMPOSITE_TENANT_MIGRATION = '20260929173500_issue_634_composite_tenant_referential_integrity';

async function appliedMigration(client) {
  const table = await client.query(`select to_regclass('public."_prisma_migrations"')::text as name`);
  if (!table.rows[0]?.name) return false;
  const result = await client.query(
    `select 1
       from public."_prisma_migrations"
      where migration_name = $1
        and rolled_back_at is null
        and finished_at is not null
      limit 1`,
    [COMPOSITE_TENANT_MIGRATION]
  );
  return result.rowCount > 0;
}

async function loadPolicy(policyPath) {
  const parsed = JSON.parse(await readFile(policyPath, 'utf8'));
  validatePolicy(parsed);
  return parsed;
}

async function guardCoverage(client, policy) {
  const names = expandPolicy(policy)
    .filter((relation) => relation.classification === 'DB_ENFORCEABLE')
    .map((relation) => guardNames(relation).constraint);
  const result = await client.query(
    `select conname
       from pg_constraint
      where contype='f'
        and connamespace='public'::regnamespace
        and conname = any($1::text[])`,
    [names]
  );
  return { expected: names.length, present: result.rowCount };
}

export async function inspectCompositeTenantCompatibility({ databaseUrl, policyPath }) {
  if (!databaseUrl) throw new Error('MISSING_PREREQUISITE:DATABASE_URL');
  const resolvedPolicyPath = policyPath || path.resolve(process.cwd(), '..', 'config', 'composite-tenant-integrity-v634.json');
  const policy = await loadPolicy(resolvedPolicyPath);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const [applied, coverage] = await Promise.all([appliedMigration(client), guardCoverage(client, policy)]);
    if (coverage.present > 0 && coverage.present < coverage.expected) {
      throw new Error(
        `MIGRATION_DUPLICATE_AUTHORITY:${COMPOSITE_TENANT_MIGRATION}:partial-guards=${coverage.present}/${coverage.expected}`
      );
    }
    if (coverage.present === coverage.expected && !applied) {
      throw new Error(`MIGRATION_DUPLICATE_AUTHORITY:${COMPOSITE_TENANT_MIGRATION}:untracked-complete-authority`);
    }
    return {
      applied,
      complete: coverage.present === coverage.expected,
      requiresProjection: coverage.present === 0,
      ...coverage,
    };
  } finally {
    await client.end();
  }
}

export async function projectCompositeTenantCompatibility({ databaseUrl, policyPath }) {
  if (!databaseUrl) throw new Error('MISSING_PREREQUISITE:DATABASE_URL');
  const resolvedPolicyPath = policyPath || path.resolve(process.cwd(), '..', 'config', 'composite-tenant-integrity-v634.json');
  const policy = await loadPolicy(resolvedPolicyPath);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const coverage = await guardCoverage(client, policy);
    if (coverage.present === coverage.expected) return [];
    if (coverage.present !== 0) {
      throw new Error(
        `MIGRATION_DUPLICATE_AUTHORITY:${COMPOSITE_TENANT_MIGRATION}:partial-guards=${coverage.present}/${coverage.expected}`
      );
    }

    await client.query('BEGIN');
    try {
      await client.query(buildMigration(policy));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `MIGRATION_APPLY_FAILED:${COMPOSITE_TENANT_MIGRATION}:${error instanceof Error ? error.message : String(error)}`
      );
    }

    const finalCoverage = await guardCoverage(client, policy);
    if (finalCoverage.present !== finalCoverage.expected) {
      throw new Error(
        `MIGRATION_APPLY_FAILED:${COMPOSITE_TENANT_MIGRATION}:guard-coverage=${finalCoverage.present}/${finalCoverage.expected}`
      );
    }
    return [COMPOSITE_TENANT_MIGRATION];
  } finally {
    await client.end();
  }
}
