import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

if (!databaseUrl) throw new Error('HIPICO_DB_CONTRACT_DATABASE_URL_REQUIRED');
if (process.env.HIPICO_DB_CONTRACT_EPHEMERAL !== '1') {
  throw new Error('HIPICO_DB_CONTRACT_EPHEMERAL_OPT_IN_REQUIRED');
}

const parsedUrl = new URL(databaseUrl);
const allowedHost = parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost';
const allowedDatabase = parsedUrl.pathname.replace(/^\//, '') === 'hipico_ci';
if (!allowedHost || !allowedDatabase) {
  throw new Error('HIPICO_DB_CONTRACT_REFUSES_NON_EPHEMERAL_DATABASE');
}

const migrationPath = path.join(repoRoot, 'supabase/sql/hipico_v17_outbox_reconciliation_status.sql');
const migrationSql = await fs.readFile(migrationPath, 'utf8');
const client = new Client({ connectionString: databaseUrl });
let connected = false;

async function resetFixture() {
  await client.query(`
    create schema if not exists public;
    drop table if exists public.hipico_outbox;
    create table public.hipico_outbox (
      id text primary key,
      status text not null default 'queued'
        check (status in ('queued','sending','sent','retry','cancelled','failed')),
      last_error text
    );
  `);
}

async function assertContract() {
  const constraint = await client.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid='public.hipico_outbox'::regclass
      and conname='hipico_outbox_status_check'
  `);
  assert.equal(constraint.rowCount, 1);
  assert.match(constraint.rows[0].definition, /reconciliation_required/);

  await client.query(`
    insert into public.hipico_outbox(id,status,last_error)
    values ('ambiguous-1','reconciliation_required','RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE')
  `);

  await client.query('savepoint invalid_status');
  try {
    await client.query(`insert into public.hipico_outbox(id,status) values ('invalid-1','mystery')`);
    assert.fail('unknown outbox state must be rejected');
  } catch (error) {
    assert.equal(error.code, '23514');
    await client.query('rollback to savepoint invalid_status');
  }
}

try {
  await client.connect();
  connected = true;
  await client.query('begin');
  await resetFixture();
  await client.query(migrationSql);
  await assertContract();

  // The migration must be replay-safe and must not rewrite ambiguous evidence.
  await client.query(migrationSql);
  const persisted = await client.query(`
    select status,last_error from public.hipico_outbox where id='ambiguous-1'
  `);
  assert.deepEqual(persisted.rows, [{
    status: 'reconciliation_required',
    last_error: 'RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE'
  }]);

  console.log('HIPICO_OUTBOX_RECONCILIATION_CONTRACT_PASS');
  await client.query('rollback');
} catch (error) {
  if (connected) await client.query('rollback').catch(() => {});
  throw error;
} finally {
  if (connected) await client.end().catch(() => {});
}
