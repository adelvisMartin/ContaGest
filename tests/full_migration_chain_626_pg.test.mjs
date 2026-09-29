import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import pg from 'pg';
import { assertEphemeralDatabase } from '../scripts/migration-chain/core.mjs';
import { ROOT, applyMigration, resetEphemeralDatabase } from '../scripts/migration-chain/runner.mjs';

const { Client } = pg;

test('#626 invalid migration rolls back atomically on real PostgreSQL', async () => {
  const url = String(process.env.DATABASE_URL || '').trim();
  assertEphemeralDatabase(url);
  const client = new Client({ connectionString: url, application_name: 'contagest-migration-chain-626-rollback' });
  await client.connect();
  try {
    await resetEphemeralDatabase(client);
    await assert.rejects(
      applyMigration(client, path.join(ROOT, 'tests/fixtures/migration-chain'), 'invalid_transaction'),
      (error) => error.code === 'MIGRATION_APPLY_FAILED'
    );
    const probe = await client.query(`select to_regclass('public."Migration626RollbackProbe"')::text as name`);
    assert.equal(probe.rows[0]?.name, null);
  } finally {
    await resetEphemeralDatabase(client);
    await client.end();
  }
});
