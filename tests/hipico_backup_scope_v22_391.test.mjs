import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildRolloutPlan,
  loadBackupScopeContract,
  validateBackupEvidence
} from '../scripts/hipico-schema-rollout-preflight-v17.mjs';

const SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW=new Date('2026-09-18T02:30:00.000Z');

const drift=()=>({
  schema:'hipico-schema-drift-report.v15',
  candidateSha:SHA,
  status:'DRIFT',
  target:{database:'postgres',remote:true},
  missing:['outbox.receipts'],
  observed:[]
});

test('v22 backup inventory is versioned and contains exactly the canonical Hípico table scope',async()=>{
  const text=await readFile(new URL('../ops/backup/hipico-public-tables.txt',import.meta.url),'utf8');
  const tables=text.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith('#'));
  assert.equal(tables.length,25);
  assert.equal(new Set(tables).size,25);
  for(const required of [
    'hipico_users',
    'hipico_workspaces',
    'hipico_audit_events',
    'hipico_outbox',
    'hipico_outbox_receipts',
    'hipico_ledger_entries',
    'hipico_reconciliations',
    'hipico_observability_events'
  ]) assert.ok(tables.includes(required),`missing ${required}`);
  assert.ok(tables.every((name)=>/^hipico_[a-z0-9_]+$/.test(name)));
  assert.doesNotMatch(text,/whatsapp|session|cookie|token|secret/i);
});

test('v22 rollout manifest declares exact backup scope and inventory',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../ops/roadmap/hipico-schema-rollout-v17.json',import.meta.url),'utf8'));
  assert.equal(manifest.chain,'v12-v27');
  assert.equal(manifest.backupScope,'hipico-canonical-v12-v27');
  assert.equal(manifest.backupTableInventory,'ops/backup/hipico-public-tables.txt');
});

test('v22 preflight derives scope contract from the versioned inventory hash',async()=>{
  const contract=await loadBackupScopeContract();
  assert.equal(contract.scope,'hipico-canonical-v12-v27');
  assert.equal(contract.migrationChain,'v12-v27');
  assert.equal(contract.tableInventory,'ops/backup/hipico-public-tables.txt');
  assert.match(contract.tableManifestSha256,/^[a-f0-9]{64}$/);

  const raw=await readFile(new URL('../ops/backup/hipico-public-tables.txt',import.meta.url));
  assert.equal(contract.tableManifestSha256,createHash('sha256').update(raw).digest('hex'));
});

test('v22 valid Hípico backup evidence can unlock manual apply',async()=>{
  const contract=await loadBackupScopeContract();
  const presentTables=contract.canonicalTables.slice(0,11);
  const deferredTables=contract.canonicalTables.slice(11);
  const evidence={
    schema:'hipico-schema-backup-evidence.v17',
    candidateSha:SHA,
    status:'PASS',
    restoreVerified:true,
    backupId:'hipico-backup-001',
    restoreTestId:'hipico-restore-001',
    targetDatabase:'postgres',
    checkedAt:'2026-09-18T02:00:00.000Z',
    scope:contract.scope,
    migrationChain:contract.migrationChain,
    tableManifestSha256:contract.tableManifestSha256,
    mode:'PRE_ROLLOUT',
    canonicalTableCount:contract.canonicalTableCount,
    sourceTableCount:presentTables.length,
    presentTables,
    deferredTables
  };
  const validated=validateBackupEvidence(evidence,{
    candidateSha:SHA,
    targetDatabase:'postgres',
    now:NOW,
    expectedScope:contract.scope,
    expectedMigrationChain:contract.migrationChain,
    expectedTableManifestSha256:contract.tableManifestSha256,
    expectedMode:'PRE_ROLLOUT',
    expectedCanonicalTableCount:contract.canonicalTableCount,
    expectedCanonicalTables:contract.canonicalTables
  });
  assert.equal(validated.ok,true);

  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:drift(),
    migrationUnits:[],
    backupEvidence:evidence,
    changeTicket:'#391',
    backupScopeContract:contract,
    now:NOW
  });
  assert.equal(plan.status,'READY_FOR_MANUAL_APPLY');
  assert.equal(plan.backup.scope,'hipico-canonical-v12-v27');
  assert.equal(plan.backup.migrationChain,'v12-v27');
  assert.equal(plan.backup.tableManifestSha256,contract.tableManifestSha256);
});

test('v22 backup from another product scope is blocked fail-closed',async()=>{
  const contract=await loadBackupScopeContract();
  const base={
    schema:'hipico-schema-backup-evidence.v17',
    candidateSha:SHA,
    status:'PASS',
    restoreVerified:true,
    backupId:'foreign-backup',
    restoreTestId:'foreign-restore',
    targetDatabase:'postgres',
    checkedAt:'2026-09-18T02:00:00.000Z',
    scope:contract.scope,
    migrationChain:contract.migrationChain,
    tableManifestSha256:contract.tableManifestSha256
  };

  const cases=[
    [{...base,scope:'contagest-prisma-data'},'BACKUP_SCOPE_MISMATCH'],
    [{...base,migrationChain:'v12-v26'},'BACKUP_MIGRATION_CHAIN_MISMATCH'],
    [{...base,tableManifestSha256:'b'.repeat(64)},'BACKUP_TABLE_MANIFEST_MISMATCH']
  ];
  for(const [evidence,reason] of cases){
    const result=validateBackupEvidence(evidence,{
      candidateSha:SHA,
      targetDatabase:'postgres',
      now:NOW,
      expectedScope:contract.scope,
      expectedMigrationChain:contract.migrationChain,
      expectedTableManifestSha256:contract.tableManifestSha256
    });
    assert.equal(result.ok,false);
    assert.equal(result.reason,reason);
  }
});

test('v22 MATCH remains NO_CHANGES without backup evidence',async()=>{
  const contract=await loadBackupScopeContract();
  const plan=buildRolloutPlan({
    candidateSha:SHA,
    driftReport:{...drift(),status:'MATCH',missing:[]},
    migrationUnits:[],
    backupEvidence:null,
    changeTicket:'',
    backupScopeContract:contract,
    now:NOW
  });
  assert.equal(plan.status,'NO_CHANGES');
});
