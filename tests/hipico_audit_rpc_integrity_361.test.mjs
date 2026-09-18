import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const MIGRATION='supabase/sql/hipico_v26_audit_rpc_integrity.sql';

const EXPECTED=new Map([
  ['race_locked','race'],['race_unlocked','race'],['bet_duplicated','bet'],['bet_cancelled','bet'],
  ['settlement_reopened','race'],['race_closed','race'],['advanced_group_cleared','advanced'],
  ['advanced_deleted','advanced'],['race_created','race'],['participant_updated','participant'],
  ['participant_created','participant'],['board_updated','race'],['advanced_created','advanced'],
  ['advanced_imported','advanced'],['movement_posted','movement'],['settings_updated','workspace'],
  ['group_created','group'],['rate_added','rate'],['polla_created','polla'],['polla_entry_added','polla'],
  ['polla_updated','polla'],['whatsapp_imported','race'],['board_from_whatsapp','race'],
  ['bet_created_multi','bet'],['race_settled','race'],['advanced_loaded','race'],
  ['day_closed','day'],['week_closed','week']
]);

test('v26 freezes the current PWA mutation action/entity catalog', async()=>{
  const [migration,app]=await Promise.all([read(MIGRATION),read('frontend/public/hipico-control/assets/js/app.js')]);
  const pwa=[...app.matchAll(/\b(?:mutate|addAudit)\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g)]
    .map(([,action,entity])=>[action,entity]);
  const pwaMap=new Map(pwa);
  assert.deepEqual([...pwaMap.entries()].sort(),[...EXPECTED.entries()].sort());

  const sqlPairs=[...migration.matchAll(/when\s+'([^']+)'\s+then\s+'([^']+)'/gi)]
    .map(([,action,entity])=>[action,entity]);
  assert.deepEqual([...new Map(sqlPairs).entries()].sort(),[...EXPECTED.entries()].sort());
});

test('v26 preserves the RPC signature and hardens SECURITY DEFINER execution', async()=>{
  const sql=await read(MIGRATION);
  assert.match(sql,/hipico_append_audit\s*\(\s*p_workspace_id uuid,\s*p_action text,\s*p_entity_type text,\s*p_entity_id text,\s*p_payload jsonb default '\{\}'::jsonb\s*\)/is);
  assert.match(sql,/security definer/is);
  assert.match(sql,/set search_path\s*=\s*''/i);
  assert.match(sql,/HIPICO_AUDIT_ROLE_FORBIDDEN/);
  assert.match(sql,/v_role\s+not in\s*\('admin','operator'\)/i);
  assert.match(sql,/HIPICO_AUDIT_ACTION_INVALID/);
  assert.match(sql,/HIPICO_AUDIT_ENTITY_MISMATCH/);
  assert.match(sql,/HIPICO_AUDIT_PAYLOAD_TOO_LARGE/);
  assert.match(sql,/pg_column_size\(v_raw_payload\)\s*>\s*16384/i);
  assert.match(sql,/HIPICO_AUDIT_EVENT_ID_REQUIRED/);
});

test('v26 makes audit provenance server-owned and advisory for client sync', async()=>{
  const sql=await read(MIGRATION);
  for(const key of ['actorUserId','actorRole','source','authority','financialAuthority','settlementAuthority']){
    assert.match(sql,new RegExp(`'${key}'`));
  }
  assert.match(sql,/source\s*=\s*'client_sync'/i);
  assert.match(sql,/authority\s*=\s*'advisory'/i);
  assert.match(sql,/financialAuthority['"]?\s*,\s*false/i);
  assert.match(sql,/settlementAuthority['"]?\s*,\s*false/i);
  assert.match(sql,/revoke all on function public\.hipico_append_audit\(uuid, text, text, text, jsonb\) from public, anon/i);
  assert.match(sql,/grant execute on function public\.hipico_append_audit\(uuid, text, text, text, jsonb\) to authenticated, service_role/i);
});

test('v26 preserves historical rows and durable idempotency', async()=>{
  const sql=await read(MIGRATION);
  assert.match(sql,/add column if not exists source text/i);
  assert.match(sql,/add column if not exists authority text/i);
  assert.match(sql,/update public\.hipico_audit_events\s+set source\s*=\s*'legacy'/is);
  assert.match(sql,/idempotency_key/i);
  assert.match(sql,/hipico_audit_owner_idempotency_unique/i);
  assert.match(sql,/HIPICO_AUDIT_REPLAY_MISMATCH/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.hipico_audit_events/i);
});


test('v14 PostgreSQL probe is isolated, transactional and fail-closed', async()=>{
  const probe=await read('scripts/hipico-audit-rpc-v14-pg.mjs');
  assert.match(probe,/127\.0\.0\.1|localhost/);
  assert.match(probe,/hipico_e2e_/);
  assert.match(probe,/Refusing non-local audit RPC probe host/);
  assert.match(probe,/BEGIN/);
  assert.match(probe,/ROLLBACK/);
  assert.doesNotMatch(probe,/\bCOMMIT\b/);
  for(const marker of [
    'V26_PROBE_ACTOR_SPOOFED',
    'V26_EXPECTED_REPLAY_MISMATCH_MISSING',
    'V26_EXPECTED_ACTION_REJECTION_MISSING',
    'V26_EXPECTED_ENTITY_REJECTION_MISSING',
    'V26_EXPECTED_PAYLOAD_REJECTION_MISSING',
    'V26_EXPECTED_CROSS_WORKSPACE_REJECTION_MISSING',
    'V26_EXPECTED_VIEWER_REJECTION_MISSING',
    'V26_EXPECTED_AUDITOR_REJECTION_MISSING',
    'V26_PROBE_ANON_EXECUTE_PRESENT'
  ]) assert.match(probe,new RegExp(marker));
});
