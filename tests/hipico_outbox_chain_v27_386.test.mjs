import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL('../'+relative,import.meta.url),'utf8');
const esc=(value)=>String(value).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');

function migrationOrder(source){
  const start=source.indexOf('const migrations = [');
  const end=source.indexOf('];',start);
  assert.ok(start>=0&&end>start,'canonical migration array missing');
  return [...source.slice(start,end).matchAll(/'((?:supabase\/sql\/hipico_v[^']+\.sql))'/g)].map((m)=>m[1]);
}

test('v27 chain restores all canonical v21 migrations in historical order and hardens authority last',async()=>{
  const schema=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  const order=migrationOrder(schema);
  const expectedSequence=[
    'supabase/sql/hipico_v21_race_data_conflicts.sql',
    'supabase/sql/hipico_v21_production_outbox.sql',
    'supabase/sql/hipico_v21_outbox_reconciliation_audit.sql',
    'supabase/sql/hipico_v22_agent_shadow.sql'
  ];
  const indexes=expectedSequence.map((item)=>order.indexOf(item));
  indexes.forEach((index,i)=>assert.ok(index>=0,'missing migration '+expectedSequence[i]));
  assert.deepEqual([...indexes].sort((a,b)=>a-b),indexes,'v21/v22 order must remain historical');
  assert.equal(order.at(-2),'supabase/sql/hipico_v26_audit_rpc_integrity.sql');
  assert.equal(order.at(-1),'supabase/sql/hipico_v27_outbox_authority.sql');
  assert.equal(order.length,26);
});

test('v27 migration removes direct browser write authority while keeping row-scoped reads',async()=>{
  const sql=await read('supabase/sql/hipico_v27_outbox_authority.sql');
  for(const policy of [
    'hipico_outbox_insert_own',
    'hipico_outbox_update_own',
    'hipico_outbox_receipts_insert_own'
  ]) assert.match(sql,new RegExp('DROP POLICY IF EXISTS '+policy,'i'));

  for(const table of ['hipico_outbox','hipico_outbox_receipts']){
    assert.match(sql,new RegExp('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\\.'+table+' FROM anon, authenticated','i'));
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY','i'));
  }

  assert.match(sql,/hipico_outbox_select_own/i);
  assert.match(sql,/hipico_outbox_receipts_select_own/i);
  assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)[^;]*TO\s+(?:anon|authenticated)/i);
});

test('v27 E2E proves receipts, leases, reconciliation audit and authenticated write denial',async()=>{
  const schema=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  for(const marker of [
    "'hipico_outbox_receipts'",
    "'hipico_outbox_receipts_immutable'",
    "'correlation_id'",
    "'payload_digest'",
    "'provider'",
    "'lease_token'",
    "'leased_at'",
    "'leased_until'",
    "'reconciled_by'",
    "'reconciled_at'",
    "'reconciliation_reason'",
    'authenticatedOutboxWriteDenied',
    'authenticatedOutboxReceiptWriteDenied',
    'outboxReceiptAppendOnlyTrigger',
    'outboxAuthorityPoliciesRemoved'
  ]) assert.match(schema,new RegExp(esc(marker)));
});

test('v27 drift manifest includes canonical outbox receipt and reconciliation markers',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-capabilities-v15.json'));
  const byId=new Map(manifest.capabilities.map((item)=>[item.id,item]));
  for(const [id,sourceFile] of [
    ['outbox.receipts','supabase/sql/hipico_v21_production_outbox.sql'],
    ['outbox.reconciled_by','supabase/sql/hipico_v21_outbox_reconciliation_audit.sql'],
    ['outbox.reconciliation_reason','supabase/sql/hipico_v21_outbox_reconciliation_audit.sql']
  ]){
    assert.equal(byId.get(id)?.sourceFile,sourceFile,'missing capability '+id);
  }
});

test('v27 rollout manifest exactly mirrors the canonical migration order',async()=>{
  const [manifestText,schema]=await Promise.all([
    read('ops/roadmap/hipico-schema-rollout-v17.json'),
    read('scripts/hipico-apply-e2e-schema-v290.mjs')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.chain,'v12-v27');
  assert.equal(manifest.migrations.length,26);
  assert.deepEqual(manifest.migrations.map((item)=>item.path),migrationOrder(schema));
  assert.equal(manifest.migrations.at(-1).path,'supabase/sql/hipico_v27_outbox_authority.sql');
  assert.equal(manifest.migrations.at(-1).risk,'HIGH');
});

test('v27 postdeploy verifies receipts append-only and browser write authority is absent',async()=>{
  const source=await read('scripts/hipico-schema-postdeploy-v18.mjs');
  for(const marker of [
    'outboxReceiptsTablePresent',
    'outboxReceiptsRls',
    'outboxReceiptsAppendOnlyTrigger',
    'outboxAuthenticatedInsert',
    'outboxAuthenticatedUpdate',
    'outboxAuthenticatedDelete',
    'outboxReceiptsAuthenticatedInsert',
    'outboxInsertPolicyPresent',
    'outboxUpdatePolicyPresent',
    'outboxReceiptsInsertPolicyPresent'
  ]) assert.match(source,new RegExp(marker));
  assert.match(source,/hipico_outbox_receipts_immutable/);
  assert.match(source,/has_table_privilege/);
  assert.match(source,/pg_policies/);
});

test('v27 release evidence consistently declares v12-v27',async()=>{
  const files=[
    'scripts/hipico-release-guard-v290.mjs',
    'scripts/hipico-verify-evidence-v290.mjs',
    'scripts/hipico-release-report-v290.mjs',
    '.github/workflows/hipico-production-gates-v290.yml',
    'tests/hipico_postgres_e2e_chain_290.test.mjs',
    'tests/hipico_release_hardening_290_contract.test.mjs'
  ];
  for(const file of files){
    const source=await read(file);
    assert.match(source,/v12-v27/,file+' must declare v12-v27');
    assert.doesNotMatch(source,/v12-v26/,file+' must not freeze stale v12-v26');
  }
});
