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
  'supabase/sql/hipico_v13_workspace_sync_security.sql',
  'supabase/sql/hipico_v14_canonical_domain.sql',
  'supabase/sql/hipico_v15_domain_integrity_alignment.sql'
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
    'hipico_audit_events',
    'hipico_domain_aggregates',
    'hipico_domain_events'
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

  const directMutationPrivileges = await client.query(`
    select
      has_table_privilege('authenticated','public.hipico_domain_aggregates','INSERT') as aggregate_insert,
      has_table_privilege('authenticated','public.hipico_domain_aggregates','UPDATE') as aggregate_update,
      has_table_privilege('authenticated','public.hipico_domain_events','INSERT') as event_insert,
      has_table_privilege('authenticated','public.hipico_domain_events','DELETE') as event_delete
  `);
  assert.equal(directMutationPrivileges.rows[0].aggregate_insert, false);
  assert.equal(directMutationPrivileges.rows[0].aggregate_update, false);
  assert.equal(directMutationPrivileges.rows[0].event_insert, false);
  assert.equal(directMutationPrivileges.rows[0].event_delete, false);
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

async function assertCanonicalDomainContract(ownerId) {
  await client.query('begin');
  try {
    await client.query(`
      insert into public.hipico_domain_aggregates(owner_id,group_key,aggregate_kind,aggregate_key,status,state_version)
      values
        ($1::uuid,'group-a','race','race-1','OPEN',1),
        ($1::uuid,'group-b','race','race-1','PREPARING',0)
    `,[ownerId]);

    await client.query(`
      insert into public.hipico_domain_events(
        id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_id,source_message_key,event_type,
        disposition,previous_state,next_state,reason,source,schema_version,event_timestamp
      ) values (
        'event-a-1',$1::uuid,'group-a','race','race-1','provider-msg-1','source-msg-1','RACE_OPENED',
        'applied','PREPARING','OPEN','VALID_TRANSITION','canonical_operator_api',1,now()
      )
    `,[ownerId]);

    await client.query(`
      insert into public.hipico_domain_events(
        id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_id,source_message_key,event_type,
        disposition,previous_state,next_state,reason,source,schema_version,event_timestamp
      ) values (
        'event-b-1',$1::uuid,'group-b','race','race-1','provider-msg-1','source-msg-1','RACE_OPENED',
        'review','PREPARING','PREPARING','AMBIGUOUS_OR_UNKNOWN','canonical_operator_api',1,now()
      )
    `,[ownerId]);

    const isolated = await client.query(`
      select group_key,count(*)::int as event_count
      from public.hipico_domain_events
      where owner_id=$1::uuid and aggregate_key='race-1'
      group by group_key order by group_key
    `,[ownerId]);
    assert.deepEqual(isolated.rows,[
      {group_key:'group-a',event_count:1},
      {group_key:'group-b',event_count:1}
    ]);

    await client.query('savepoint duplicate_domain_source');
    try {
      await client.query(`
        insert into public.hipico_domain_events(
          id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_key,event_type,
          disposition,previous_state,next_state,reason,source,schema_version,event_timestamp
        ) values (
          'event-a-duplicate',$1::uuid,'group-a','race','race-1','source-msg-1','RESULT_RECORDED',
          'review','OPEN','OPEN','SAME_STATE_EVIDENCE','canonical_operator_api',1,now()
        )
      `,[ownerId]);
      assert.fail('same source identity with another parser event type must still be rejected');
    } catch (error) {
      assert.equal(error.code,'23505');
      await client.query('rollback to savepoint duplicate_domain_source');
    }

    await client.query('savepoint orphan_domain_event');
    try {
      await client.query(`
        insert into public.hipico_domain_events(
          id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_key,event_type,
          disposition,previous_state,next_state,reason,source,schema_version,event_timestamp
        ) values (
          'orphan-event',$1::uuid,'group-a','race','missing-race','source-orphan','UNKNOWN',
          'review','PREPARING','PREPARING','AMBIGUOUS_OR_UNKNOWN','canonical_operator_api',1,now()
        )
      `,[ownerId]);
      assert.fail('canonical event must reference an existing scoped aggregate');
    } catch (error) {
      assert.equal(error.code,'23503');
      await client.query('rollback to savepoint orphan_domain_event');
    }

    await client.query('savepoint mutate_domain_event');
    try {
      await client.query(`update public.hipico_domain_events set reason='tampered' where id='event-a-1'`);
      assert.fail('canonical domain events must be append-only');
    } catch (error) {
      assert.match(String(error.message || error),/HIPICO_DOMAIN_EVENTS_APPEND_ONLY/);
      await client.query('rollback to savepoint mutate_domain_event');
    }

    await client.query('savepoint delete_domain_event');
    try {
      await client.query(`delete from public.hipico_domain_events where id='event-a-1'`);
      assert.fail('canonical domain events must not be physically deleted');
    } catch (error) {
      assert.match(String(error.message || error),/HIPICO_DOMAIN_EVENTS_APPEND_ONLY/);
      await client.query('rollback to savepoint delete_domain_event');
    }

    const constraints = await client.query(`
      select conname,pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid='public.hipico_domain_events'::regclass
    `);
    assert.ok(constraints.rows.some((row)=>row.conname==='hipico_domain_events_source_identity_unique'));
    assert.ok(constraints.rows.some((row)=>row.conname==='hipico_domain_events_aggregate_fk'));

    const identityIndex = await client.query(`
      select indexname,indexdef from pg_indexes
      where schemaname='public' and tablename='hipico_domain_events'
        and indexname='hipico_domain_events_source_identity_v297'
    `);
    assert.equal(identityIndex.rowCount,1);
    assert.match(identityIndex.rows[0].indexdef,/UNIQUE INDEX/i);

    const immutableTrigger = await client.query(`
      select tgname
      from pg_trigger
      where tgrelid='public.hipico_domain_events'::regclass
        and tgname='hipico_domain_events_immutable'
        and not tgisinternal
    `);
    assert.equal(immutableTrigger.rowCount,1);
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
  await assertCanonicalDomainContract(ownerId);
  console.log('HIPICO_DB_CONTRACT_PASS');
} finally {
  await cleanup();
  if (connected) await client.end().catch(() => {});
}
