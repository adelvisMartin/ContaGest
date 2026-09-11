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

if (!databaseUrl) throw new Error('HIPICO_DB_CONTRACT_DATABASE_URL_REQUIRED');
if (process.env.HIPICO_DB_CONTRACT_EPHEMERAL !== '1') throw new Error('HIPICO_DB_CONTRACT_EPHEMERAL_OPT_IN_REQUIRED');
const parsed = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname.replace(/^\//, '') !== 'hipico_ci') {
  throw new Error('HIPICO_DB_CONTRACT_REFUSES_NON_EPHEMERAL_DATABASE');
}

const client = new Client({ connectionString: databaseUrl });
const ownerId = crypto.randomUUID();
const aggregateKey = 'racectx_confirmation_contract';
const migrationPath = path.join(repoRoot, 'supabase/sql/hipico_v16_operator_confirmation_audit.sql');

await client.connect();
try {
  const migration = await fs.readFile(migrationPath, 'utf8');
  await client.query(migration);

  const columns = await client.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema='public' and table_name='hipico_domain_events'
      and column_name in ('operator_confirmed','confirmation_reason')
    order by column_name
  `);
  assert.equal(columns.rowCount, 2);
  const operatorColumn = columns.rows.find((row) => row.column_name === 'operator_confirmed');
  assert.equal(operatorColumn?.data_type, 'boolean');
  assert.equal(operatorColumn?.is_nullable, 'NO');

  const constraint = await client.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid='public.hipico_domain_events'::regclass
      and conname='hipico_domain_events_confirmation_audit_check'
  `);
  assert.equal(constraint.rowCount, 1);
  assert.match(constraint.rows[0].definition, /operator_confirmed/);
  assert.match(constraint.rows[0].definition, /confirmation_reason/);

  await client.query('begin');
  try {
    await client.query(`
      insert into public.hipico_domain_aggregates(owner_id,group_key,aggregate_kind,aggregate_key,status,state_version)
      values ($1::uuid,'g1','race',$2,'PREPARING',0)
    `,[ownerId,aggregateKey]);

    await client.query(`
      insert into public.hipico_domain_events(
        id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_key,event_type,
        disposition,previous_state,next_state,reason,source,schema_version,event_timestamp,
        operator_confirmed,confirmation_reason
      ) values (
        $1,$2::uuid,'g1','race',$3,'source-ok','RACE_OPENED',
        'applied','PREPARING','OPEN','VALID_TRANSITION','contract',1,now(),true,'operator verified opening'
      )
    `,[crypto.randomUUID(),ownerId,aggregateKey]);

    await client.query('savepoint missing_reason');
    try {
      await client.query(`
        insert into public.hipico_domain_events(
          id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_key,event_type,
          disposition,previous_state,next_state,reason,source,schema_version,event_timestamp,
          operator_confirmed,confirmation_reason
        ) values (
          $1,$2::uuid,'g1','race',$3,'source-bad-confirmed','RACE_CLOSED',
          'applied','OPEN','CLOSED','VALID_TRANSITION','contract',1,now(),true,null
        )
      `,[crypto.randomUUID(),ownerId,aggregateKey]);
      assert.fail('confirmed event without reason must violate database audit contract');
    } catch (error) {
      assert.equal(error.code, '23514');
      await client.query('rollback to savepoint missing_reason');
    }

    await client.query('savepoint orphan_reason');
    try {
      await client.query(`
        insert into public.hipico_domain_events(
          id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_key,event_type,
          disposition,previous_state,next_state,reason,source,schema_version,event_timestamp,
          operator_confirmed,confirmation_reason
        ) values (
          $1,$2::uuid,'g1','race',$3,'source-bad-unconfirmed','BET_RECORDED',
          'evidence_only','OPEN','OPEN','APPEND_ONLY_EVIDENCE','contract',1,now(),false,'orphan reason'
        )
      `,[crypto.randomUUID(),ownerId,aggregateKey]);
      assert.fail('unconfirmed event with confirmation reason must violate database audit contract');
    } catch (error) {
      assert.equal(error.code, '23514');
      await client.query('rollback to savepoint orphan_reason');
    }
  } finally {
    await client.query('rollback');
  }
  console.log('[hipico-v16-confirmation-audit-contract] PASS');
} finally {
  await client.end();
}
