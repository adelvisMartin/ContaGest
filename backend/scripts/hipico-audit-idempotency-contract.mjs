import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('HIPICO_DB_CONTRACT_DATABASE_URL_REQUIRED');
if (process.env.HIPICO_DB_CONTRACT_EPHEMERAL !== '1') throw new Error('HIPICO_DB_CONTRACT_EPHEMERAL_OPT_IN_REQUIRED');
const parsed = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname.replace(/^\//, '') !== 'hipico_ci') {
  throw new Error('HIPICO_DB_CONTRACT_REFUSES_NON_EPHEMERAL_DATABASE');
}

const migrations = [
  'supabase/sql/hipico_v12_operations.sql',
  'supabase/sql/hipico_v12_group_bridge.sql',
  'supabase/sql/hipico_v12_shadow_validation.sql',
  'supabase/sql/hipico_v13_workspace_sync_security.sql',
  'supabase/sql/hipico_v13_audit_idempotency.sql'
];
const client = new Client({ connectionString: databaseUrl });
let connected = false;

async function apply(relativePath) {
  await client.query(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

async function resetDatabase() {
  await client.query('drop schema if exists public cascade; create schema public');
  await client.query('drop schema if exists auth cascade');
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema auth;
    create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.jwt() returns jsonb
    language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
  `);
}

try {
  await client.connect();
  connected = true;
  await resetDatabase();
  for (const migration of migrations) await apply(migration);
  // Reapply the hardening migration to prove it is safe on an already-migrated DB.
  await apply('supabase/sql/hipico_v13_audit_idempotency.sql');

  const ownerId = crypto.randomUUID();
  const workspace = await client.query(
    `insert into public.hipico_workspaces(owner_id,name,state) values($1::uuid,'Audit CI','{}'::jsonb) returning id::text as id`,
    [ownerId]
  );
  const workspaceId = workspace.rows[0].id;
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerId]);

  const payload = {
    id: 'audit-contract-stable-1', groupId: 'group-a', action: 'bet_created',
    entityType: 'bet', entityId: 'bet-1', amount: 30
  };
  const args = [workspaceId, 'bet_created', 'bet', 'bet-1', JSON.stringify(payload)];
  const first = await client.query(
    `select public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)::text as id`, args
  );
  const replay = await client.query(
    `select public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)::text as id`, args
  );
  assert.equal(first.rows[0].id, replay.rows[0].id);

  const count = await client.query(
    `select count(*)::int as count from public.hipico_audit_events where owner_id=$1::uuid and idempotency_key=$2`,
    [ownerId, payload.id]
  );
  assert.equal(count.rows[0].count, 1);

  await client.query('begin');
  await client.query('savepoint replay_mismatch');
  try {
    await client.query(
      `select public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'bet_created', 'bet', 'bet-1', JSON.stringify({ ...payload, amount: 31 })]
    );
    assert.fail('same audit event id with changed payload must fail closed');
  } catch (error) {
    assert.equal(error.code, '23505');
    assert.match(String(error.message || ''), /HIPICO_AUDIT_REPLAY_MISMATCH/);
    await client.query('rollback to savepoint replay_mismatch');
  }
  await client.query('rollback');

  console.log('HIPICO_AUDIT_IDEMPOTENCY_CONTRACT_PASS');
} finally {
  if (connected) {
    await client.query('drop schema if exists public cascade; create schema public').catch(() => {});
    await client.query('drop schema if exists auth cascade').catch(() => {});
    await client.query('drop role if exists authenticated').catch(() => {});
    await client.query('drop role if exists anon').catch(() => {});
    await client.end().catch(() => {});
  }
}
