import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const explicitEphemeralOptIn = process.env.HIPICO_DB_CONTRACT_EPHEMERAL === '1';
if (!databaseUrl) throw new Error('HIPICO_DB_CONTRACT_DATABASE_URL_REQUIRED');
if (!explicitEphemeralOptIn) throw new Error('HIPICO_DB_CONTRACT_EPHEMERAL_OPT_IN_REQUIRED');

const parsedUrl = new URL(databaseUrl);
const allowedHost = parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost';
const allowedDatabase = parsedUrl.pathname.replace(/^\//, '') === 'hipico_ci';
if (!allowedHost || !allowedDatabase) {
  throw new Error('HIPICO_DB_CONTRACT_REFUSES_NON_EPHEMERAL_DATABASE');
}

const migrations = [
  'supabase/sql/hipico_v12_operations.sql',
  'supabase/sql/hipico_v12_group_bridge.sql',
  'supabase/sql/hipico_v12_shadow_validation.sql',
  'supabase/sql/hipico_v13_workspace_sync_security.sql'
];
const labBootstrap = 'supabase/sql/hipico_v13_lab_channel_bootstrap.sql';

const client = new Client({ connectionString: databaseUrl });
let connected = false;

async function apply(relativePath) {
  const sql = await fs.readFile(path.join(repoRoot, relativePath), 'utf8');
  await client.query(sql);
}

async function bootstrapSupabaseCompat() {
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.jwt() returns jsonb
    language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
  `);
}

async function assertSchemaContract(ownerId) {
  const requiredTables = [
    'hipico_bot_channels',
    'hipico_messages',
    'hipico_operation_events',
    'hipico_outbox',
    'hipico_ledger_entries',
    'hipico_reconciliations',
    'hipico_shadow_evaluations',
    'hipico_workspaces',
    'hipico_profiles',
    'hipico_audit_events'
  ];

  const tableRows = await client.query(
    `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
    [requiredTables]
  );
  assert.deepEqual(new Set(tableRows.rows.map((row) => row.tablename)), new Set(requiredTables));

  const rlsRows = await client.query(
    `select relname, relrowsecurity from pg_class where relname = any($1::text[])`,
    [requiredTables]
  );
  for (const row of rlsRows.rows) assert.equal(row.relrowsecurity, true, `RLS must be enabled for ${row.relname}`);

  const channelConstraint = await client.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.hipico_bot_channels'::regclass
      and conname = 'hipico_bot_channels_channel_type_check'
  `);
  assert.equal(channelConstraint.rowCount, 1);
  assert.match(channelConstraint.rows[0].definition, /web_bridge/);

  const labRows = await client.query(`
    select owner_id::text as owner_id, group_key, channel_type, status
    from public.hipico_bot_channels
    where group_key = 'control-hipico-lab'
  `);
  assert.equal(labRows.rowCount, 1);
  assert.equal(labRows.rows[0].owner_id, ownerId);
  assert.equal(labRows.rows[0].channel_type, 'web_bridge');
  assert.equal(labRows.rows[0].status, 'active');
}

async function assertIdempotencyAndIsolation(ownerId) {
  const secondOwner = crypto.randomUUID();
  await client.query('begin');
  try {
    await client.query(`
      insert into public.hipico_messages
        (owner_id, channel_key, external_message_id, fingerprint, raw_text, classification, confidence, processing_status)
      values ($1::uuid, 'group-a', 'msg-1', 'fp-a-1', 'Juega 1 con 30', 'offer_player', 1, 'processed')
    `, [ownerId]);

    await client.query(`
      insert into public.hipico_messages
        (owner_id, channel_key, external_message_id, fingerprint, raw_text, classification, confidence, processing_status)
      values ($1::uuid, 'group-b', 'msg-1', 'fp-b-1', 'Juega 1 con 30', 'offer_player', 1, 'processed')
    `, [ownerId]);

    await client.query('savepoint duplicate_message');
    try {
      await client.query(`
        insert into public.hipico_messages
          (owner_id, channel_key, external_message_id, fingerprint, raw_text, classification, confidence, processing_status)
        values ($1::uuid, 'group-a', 'msg-1', 'fp-a-duplicate', 'duplicate', 'offer_player', 1, 'processed')
      `, [ownerId]);
      assert.fail('duplicate source message must be rejected');
    } catch (error) {
      assert.equal(error.code, '23505');
      await client.query('rollback to savepoint duplicate_message');
    }

    await client.query(`
      insert into public.hipico_ledger_entries
        (owner_id, group_key, participant_code, product_type, reference_type, reference_id, entry_type, amount)
      values ($1::uuid, 'group-a', 'P1', 'winner', 'source_message', 'msg-1', 'bet', 30)
    `, [ownerId]);

    await client.query('savepoint duplicate_ledger');
    try {
      await client.query(`
        insert into public.hipico_ledger_entries
          (owner_id, group_key, participant_code, product_type, reference_type, reference_id, entry_type, amount)
        values ($1::uuid, 'group-a', 'P1', 'winner', 'source_message', 'msg-1', 'bet', 30)
      `, [ownerId]);
      assert.fail('duplicate ledger mutation must be rejected');
    } catch (error) {
      assert.equal(error.code, '23505');
      await client.query('rollback to savepoint duplicate_ledger');
    }

    await client.query('savepoint duplicate_lab');
    try {
      await client.query(`
        insert into public.hipico_bot_channels(owner_id, group_key, label, channel_type, status, config)
        values ($1::uuid, 'control-hipico-lab', 'Other LAB', 'web_bridge', 'active', '{}'::jsonb)
      `, [secondOwner]);
      assert.fail('there must be exactly one active LAB channel');
    } catch (error) {
      assert.equal(error.code, '23505');
      await client.query('rollback to savepoint duplicate_lab');
    }
  } finally {
    await client.query('rollback');
  }
}

async function cleanup() {
  if (!connected) return;
  await client.query('drop schema if exists public cascade; create schema public').catch(() => {});
  await client.query('drop schema if exists auth cascade').catch(() => {});
  await client.query('drop role if exists authenticated').catch(() => {});
  await client.query('drop role if exists anon').catch(() => {});
}

try {
  await client.connect();
  connected = true;
  await bootstrapSupabaseCompat();

  for (const migration of migrations) await apply(migration);

  const ownerId = crypto.randomUUID();
  await client.query(`
    insert into public.hipico_workspaces(owner_id, name, state)
    values ($1::uuid, 'CI isolated workspace', '{}'::jsonb)
  `, [ownerId]);
  await apply(labBootstrap);

  // A second pass proves that the additive SQL chain is replay-safe on the same isolated DB.
  for (const migration of migrations) await apply(migration);
  await apply(labBootstrap);

  await assertSchemaContract(ownerId);
  await assertIdempotencyAndIsolation(ownerId);
  console.log('HIPICO_DB_CONTRACT_PASS');
} finally {
  await cleanup();
  if (connected) await client.end().catch(() => {});
}
