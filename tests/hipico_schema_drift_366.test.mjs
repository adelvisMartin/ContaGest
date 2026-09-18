import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectSchema } from '../scripts/hipico-schema-drift-v15.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v15 manifest freezes mainline schema capabilities without branch-only migrations',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-capabilities-v15.json'));
  assert.equal(manifest.schema,'hipico-schema-capabilities.v15');
  assert.equal(manifest.baseline,'89286ce65e2466873463bcd5518e1dc820e2633b');
  assert.equal(manifest.capabilities.length,19);
  const ids=new Set(manifest.capabilities.map((item)=>item.id));
  for(const id of [
    'audit.idempotency_key','domain.aggregates','domain.events','outbox.reconciliation_constraint',
    'provider.evidence','documents.documents','documents.sources','agent.automation',
    'agent.policy_disposition','agent.metric_schema_version','observability.events','audit.source','audit.authority',
    'outbox.receipts','outbox.payload_digest','outbox.lease_token','outbox.reconciled_by',
    'outbox.reconciled_at','outbox.reconciliation_reason'
  ]) assert.ok(ids.has(id),`missing capability ${id}`);
});

test('v15 drift script is read-only, SHA-bound and secret-safe',async()=>{
  const source=await read('scripts/hipico-schema-drift-v15.mjs');
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/i);
  assert.match(source,/ROLLBACK/i);
  assert.doesNotMatch(source,/\b(COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  assert.match(source,/HIPICO_CANDIDATE_SHA/);
  assert.match(source,/\^\[a-f0-9\]\{40\}\$/i);
  assert.match(source,/MATCH/);
  assert.match(source,/DRIFT/);
  assert.match(source,/NOT_EXECUTED/);
  assert.doesNotMatch(source,/console\.(?:log|error)\([^\n]*(?:DATABASE_URL|connectionString|password|token)/i);
});

test('v15 uses typed catalog markers rather than arbitrary SQL from manifest',async()=>{
  const [source,manifestText]=await Promise.all([
    read('scripts/hipico-schema-drift-v15.mjs'),
    read('ops/roadmap/hipico-schema-capabilities-v15.json')
  ]);
  const manifest=JSON.parse(manifestText);
  const allowed=new Set(['table','column','constraint_contains']);
  for(const item of manifest.capabilities) assert.ok(allowed.has(item.kind),`unsupported marker kind ${item.kind}`);
  assert.doesNotMatch(manifestText,/"sql"\s*:/i);
  assert.match(source,/switch\s*\(capability\.kind\)/);
});

test('v15 missing capability produces DRIFT and non-zero exit semantics',async()=>{
  const source=await read('scripts/hipico-schema-drift-v15.mjs');
  assert.match(source,/missing\.length\s*\?\s*'DRIFT'\s*:\s*'MATCH'/);
  assert.match(source,/if\s*\(report\.status===\s*'DRIFT'\)\s*process\.exitCode=2/);
  assert.match(source,/if\s*\(report\.status===\s*'NOT_EXECUTED'\)\s*process\.exitCode=3/);
});


test('v15 deliberately missing marker is detected without touching a database',async()=>{
  const manifest=JSON.parse(await read('ops/roadmap/hipico-schema-capabilities-v15.json'));
  const missingId='documents.documents';
  const fakeClient={
    async query(sql,params=[]){
      if(String(sql).includes('to_regclass')){
        return {rows:[{relation:params[0]==='public.hipico_documents'?null:params[0]}]};
      }
      if(String(sql).includes('information_schema.columns')){
        return {rows:[{present:true}]};
      }
      if(String(sql).includes('pg_constraint')){
        return {rows:[{present:true}]};
      }
      throw new Error('unexpected query');
    }
  };
  const result=await inspectSchema(fakeClient,manifest);
  assert.equal(result.status,'DRIFT');
  assert.deepEqual(result.missing,[missingId]);
  assert.equal(result.observed.filter((item)=>item.present).length,18);
});
