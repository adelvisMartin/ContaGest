import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkAdmin, childEnv, stagePlan, fixtureSql, verifySnapshots, runDrill }
  from '../scripts/erp-disaster-recovery-v646.mjs';

const SHA='a'.repeat(40);
const ADMIN='postgresql://dr646:local@127.0.0.1:5432/postgres';

test('#646 rejects missing, production and remote/shared PostgreSQL admin targets',()=>{
  assert.equal(checkAdmin({LOCAL_VERIFY_DATABASE_ADMIN_URL:ADMIN}).hostname,'127.0.0.1');
  for(const url of [
    'postgresql://u:p@prod.example.test/postgres',
    'postgresql://u:p@127.0.0.1:5432/production',
    'postgresql://u:p@127.0.0.1:5432/contagest_verify_test_e2e',
    ADMIN+'?sslmode=disable', ADMIN+'#token',
    'https://dr646:local@127.0.0.1/postgres'
  ])assert.throws(()=>checkAdmin({LOCAL_VERIFY_DATABASE_ADMIN_URL:url}));
  for(const config of [
    {},{LOCAL_VERIFY_DATABASE_ADMIN_URL:ADMIN,NODE_ENV:'production'},
    {LOCAL_VERIFY_DATABASE_ADMIN_URL:ADMIN,NODE_ENV:'preview'},
    {LOCAL_VERIFY_DATABASE_ADMIN_URL:ADMIN,VERCEL_ENV:'preview'},
    {LOCAL_VERIFY_DATABASE_ADMIN_URL:ADMIN,CI_PRODUCTION:'true'}
  ])assert.throws(()=>checkAdmin(config));
});

test('#646 child subprocess never inherits production provider secrets or shared database URLs',()=>{
  const source={PATH:'/bin',HOME:'/tmp',NODE_ENV:'production',
    DATABASE_URL:'postgresql://prod:secret@remote.invalid/prod',
    SUPABASE_SERVICE_ROLE_KEY:'SECRET',BACKUP_AGE_IDENTITY_B64:'SECRET',
    RCLONE_CONFIG_B64:'SECRET',OPENAI_API_KEY:'SECRET',
    WHATSAPP_CLOUD_TOKEN:'SECRET',VERCEL_ENV:'production'};
  const safe=childEnv(source,'postgresql://dr:local@127.0.0.1/contagest_verify_646_e2e',SHA);
  assert.equal(safe.NODE_ENV,'test');
  assert.equal(safe.GIT_COMMIT_SHA,SHA);
  assert.match(safe.DATABASE_URL,/contagest_verify_646_e2e/);
  assert.equal(safe.DATABASE_URL,safe.DIRECT_DATABASE_URL);
  assert.equal(safe.DATABASE_URL,safe.DATABASE_RUNTIME_URL);
  for(const k of ['SUPABASE_SERVICE_ROLE_KEY','BACKUP_AGE_IDENTITY_B64',
    'RCLONE_CONFIG_B64','OPENAI_API_KEY','WHATSAPP_CLOUD_TOKEN'])assert.equal(safe[k],undefined,k);
  assert.match(safe.JWT_SECRET,/^[a-f0-9]{64}$/);
  assert.notEqual(safe.LICENSE_HASH_SECRET,safe.JWT_SECRET);
  assert.equal(source.NODE_ENV,'production','source must not be mutated');
});

test('#646 stages require both canonical migrations, a fault injection and verified cleanup',()=>{
  const plan=stagePlan();
  assert.deepEqual(plan,['prerequisites','migrate-source','seed-source','rls-source',
    'fixtures','backup','fault-injection','migrate-target','rls-target',
    'restore','api-smoke','integrity','cleanup']);
  assert.equal(new Set(plan).size,plan.length);
});

test('#646 fixtures never contain real customer identifiers and are tenant-separated',()=>{
  const ids=[randomUUID(),randomUUID()];
  const sql=fixtureSql(ids);
  for(const id of ids)assert.ok(sql.includes(id));
  assert.equal((sql.match(/INSERT INTO public\."Tenant"/g)||[]).length,2);
  assert.equal((sql.match(/INSERT INTO public\."LedgerLine"/g)||[]).length,2);
  assert.match(sql,/100\.00/);assert.match(sql,/25\.50/);
  assert.match(sql,/dr\.synthetic/);
  assert.doesNotMatch(sql,/SELECT .*FROM auth\.users|DELETE FROM public\."Tenant" WHERE true/i);
});

function control(){
  const owners=[randomUUID(),randomUUID()];
  const entries=owners.map((owner)=>({id:randomUUID(),owner,posted:true}));
  return {
    tenantIds:owners,
    clients:owners.map(owner=>({id:randomUUID(),owner})),
    entries,lines:entries.flatMap(x=>[
      {id:randomUUID(),entry:x.id,debit:'100.00',credit:'0.00'},
      {id:randomUUID(),entry:x.id,debit:'0.00',credit:'100.00'}
    ]),
    taxes:owners.map(owner=>({id:randomUUID(),owner})),
    audit:owners.map(owner=>({id:randomUUID(),owner})),
    unbalanced:0
  };
}
test('#646 rejects tenant leakage, ledger orphans, unbalanced journals and mismatched snapshots',()=>{
  const before=control();
  assert.match(verifySnapshots(before,structuredClone(before)),/^[a-f0-9]{64}$/);
  const leaked=structuredClone(before);leaked.clients[0].owner=randomUUID();
  assert.throws(()=>verifySnapshots(before,leaked),/TENANT_BOUNDARY/);
  const orphan=structuredClone(before);orphan.lines[0].entry=randomUUID();
  assert.throws(()=>verifySnapshots(before,orphan),/LEDGER_ORPHAN/);
  const unbalanced=structuredClone(before);unbalanced.unbalanced=1;
  assert.throws(()=>verifySnapshots(before,unbalanced),/INVARIANTS/);
  const mismatch=structuredClone(before);mismatch.lines[0].debit='101.00';
  assert.throws(()=>verifySnapshots(before,mismatch));
  const missing=structuredClone(before);missing.audit.pop();
  assert.throws(()=>verifySnapshots(before,missing),/INVARIANTS/);
});

test('#646 independently invalid synthetic fixtures never certify their own restore',()=>{
  const original=control();
  const ownedByWrongTenant=structuredClone(original);
  ownedByWrongTenant.clients[1].owner=original.tenantIds[0];
  assert.throws(()=>verifySnapshots(ownedByWrongTenant,structuredClone(ownedByWrongTenant)),/TENANT_DISTRIBUTION/);

  const unposted=structuredClone(original);
  unposted.entries[0].posted=false;
  assert.throws(()=>verifySnapshots(unposted,structuredClone(unposted)),/POSTED_LEDGER_REQUIRED/);

  const movedLine=structuredClone(original);
  movedLine.lines[2].entry=movedLine.entries[0].id;
  assert.throws(()=>verifySnapshots(movedLine,structuredClone(movedLine)),/LEDGER_LINE_DISTRIBUTION/);

  const imbalanced=structuredClone(original);
  imbalanced.lines[0].debit='99.00';
  assert.throws(()=>verifySnapshots(imbalanced,structuredClone(imbalanced)),/LEDGER_IMBALANCE/);

  const invalidMoney=structuredClone(original);
  invalidMoney.lines[0].debit='NaN';
  assert.throws(()=>verifySnapshots(invalidMoney,structuredClone(invalidMoney)),/DECIMAL_INVALID/);

  const zeroLine=structuredClone(original);
  zeroLine.lines[0].debit='0.00';
  assert.throws(()=>verifySnapshots(zeroLine,structuredClone(zeroLine)),/LEDGER_LINE_INVALID/);

  const valid=structuredClone(original);
  valid.lines[0].debit='100';
  valid.lines[1].credit='100.00';
  assert.match(verifySnapshots(valid,structuredClone(valid)),/^[a-f0-9]{64}$/);
});

test('#646 missing admin URL is a BLOCKED report, never synthetic success',async()=>{
  const report=await runDrill({});
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.errorCode,'DR646_LOCAL_ADMIN_REQUIRED');
  assert.equal(report.ci,'NOT_EXECUTED');
  assert.equal(report.provider,'NOT_EXECUTED');
  assert.equal(report.candidateSha,null);
});

test('#646 never uses dangerous override flags, remote credential source or Hípico scope',()=>{
  const code=readFileSync(new URL('../scripts/erp-disaster-recovery-v646.mjs',import.meta.url),'utf8');
  assert.match(code,/withEphemeralDatabase/);
  assert.match(code,/migration:test:from-zero/);
  assert.match(code,/pg_dump/);
  assert.match(code,/pg_restore/);
  assert.match(code,/FAULT_INJECTION_FAILED/);
  assert.doesNotMatch(code,/ALLOW_UNSAFE_RESTORE|ALLOW_PRIMARY_HOST_RESTORE|--clean|--create|supabase\.co/);
});
