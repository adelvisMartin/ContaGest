import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v27 chain restores all v21 outbox migrations in historical order and appends v27 hardening',async()=>{
  const source=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  const order=[
    'hipico_v21_race_data_conflicts.sql',
    'hipico_v21_production_outbox.sql',
    'hipico_v21_outbox_reconciliation_audit.sql',
    'hipico_v22_agent_shadow.sql',
    'hipico_v23_risk_policy.sql',
    'hipico_v24_shadow_metrics.sql',
    'hipico_v25_observability.sql',
    'hipico_v26_audit_rpc_integrity.sql',
    'hipico_v27_outbox_authority.sql'
  ];
  let cursor=-1;
  for(const name of order){
    const next=source.indexOf(name);
    assert.ok(next>cursor,`${name} must preserve canonical order`);
    cursor=next;
  }
  assert.match(source,/v12-v27/);
});

test('v27 migration makes outbox and receipts server-authoritative while preserving authenticated SELECT',async()=>{
  const sql=await read('supabase/sql/hipico_v27_outbox_authority.sql');
  for(const policy of [
    'hipico_outbox_insert_own',
    'hipico_outbox_update_own',
    'hipico_outbox_delete_own',
    'hipico_outbox_receipts_insert_own',
    'hipico_outbox_receipts_update_own',
    'hipico_outbox_receipts_delete_own'
  ]) assert.match(sql,new RegExp(`DROP POLICY IF EXISTS ${policy}`,'i'));

  for(const table of ['hipico_outbox','hipico_outbox_receipts']){
    assert.match(sql,new RegExp(`REVOKE ALL ON (?:TABLE )?public\\.${table} FROM anon, authenticated`,'i'));
    assert.match(sql,new RegExp(`GRANT SELECT ON (?:TABLE )?public\\.${table} TO authenticated`,'i'));
  }

  assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)/i);
  assert.match(sql,/Single production authority|server-side/i);
});

test('v27 E2E proves receipts leases reconciliation and client write denial',async()=>{
  const source=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  for(const marker of [
    'hipico_outbox_receipts',
    'hipico_outbox_receipts_immutable',
    'correlation_id',
    'payload_digest',
    'provider',
    'lease_token',
    'leased_at',
    'leased_until',
    'reconciled_by',
    'reconciled_at',
    'reconciliation_reason',
    'authenticatedOutboxWriteDenied',
    'authenticatedOutboxReceiptWriteDenied'
  ]) assert.match(source,new RegExp(marker));
});

test('v27 drift manifest includes receipts and reconciliation audit capabilities',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-capabilities-v15.json'));
  const ids=new Set(manifest.capabilities.map((item)=>item.id));
  for(const id of [
    'outbox.receipts',
    'outbox.payload_digest',
    'outbox.lease_token',
    'outbox.reconciled_by',
    'outbox.reconciled_at',
    'outbox.reconciliation_reason'
  ]) assert.equal(ids.has(id),true,`missing drift capability ${id}`);
});

test('v27 rollout manifest exactly matches the 26-file canonical migration chain',async()=>{
  const [manifestText,chain]=await Promise.all([
    read('ops/roadmap/hipico-schema-rollout-v17.json'),
    read('scripts/hipico-apply-e2e-schema-v290.mjs')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.chain,'v12-v27');
  assert.equal(manifest.migrations.length,26);
  const start=chain.indexOf('const migrations = [');
  const end=chain.indexOf('];',start);
  const canonical=[...chain.slice(start,end).matchAll(/'((?:supabase\/sql\/hipico_v[^']+\.sql))'/g)].map((m)=>m[1]);
  assert.deepEqual(manifest.migrations.map((item)=>item.path),canonical);
});

test('v27 postdeploy checks authority privileges and mutation policy absence',async()=>{
  const source=await read('scripts/hipico-schema-postdeploy-v18.mjs');
  for(const marker of [
    'outboxReceiptsPresent',
    'outboxReceiptsRls',
    'outboxReceiptsAppendOnlyTrigger',
    'outboxAuthenticatedSelectPolicyPresent',
    'outboxReceiptsAuthenticatedSelectPolicyPresent',
    'outboxClientMutationPolicyAbsent',
    'outboxReceiptsClientMutationPolicyAbsent',
    'outboxAuthenticatedDirectInsert',
    'outboxAuthenticatedDirectUpdate',
    'outboxAuthenticatedDirectDelete',
    'outboxAuthenticatedDirectTruncate',
    'outboxReceiptsAuthenticatedDirectInsert',
    'outboxReceiptsAuthenticatedDirectUpdate',
    'outboxReceiptsAuthenticatedDirectDelete',
    'outboxReceiptsAuthenticatedDirectTruncate'
  ]) assert.match(source,new RegExp(marker));
});

test('v27 release guard verifier report and workflow advertise only v12-v27',async()=>{
  const [guard,verify,report,workflow]=await Promise.all([
    read('scripts/hipico-release-guard-v290.mjs'),
    read('scripts/hipico-verify-evidence-v290.mjs'),
    read('scripts/hipico-release-report-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);
  for(const source of [guard,verify,report,workflow]) assert.match(source,/v12-v27/);
  assert.match(guard,/hipico_v21_production_outbox\.sql/);
  assert.match(guard,/hipico_v21_outbox_reconciliation_audit\.sql/);
  assert.match(guard,/hipico_v27_outbox_authority\.sql/);
  assert.match(verify,/hipico_v27_outbox_authority\.sql/);
  assert.match(workflow,/Apply v12-v27 Hípico schema and RLS RBAC probes/);
  for(const source of [guard,verify,report,workflow]) assert.doesNotMatch(source,/v12-v26/);
});


test('v27 postdeploy privilege probes remain fail-closed when receipts table is absent',async()=>{
  const source=await read('scripts/hipico-schema-postdeploy-v18.mjs');
  assert.match(source,/has_table_privilege\('authenticated',to_regclass\('public\.hipico_outbox_receipts'\)/);
  assert.match(source,/has_table_privilege\('authenticated',to_regclass\('public\.hipico_outbox'\)/);
  assert.doesNotMatch(source,/has_table_privilege\('authenticated','public\.hipico_outbox_receipts'/);
});
