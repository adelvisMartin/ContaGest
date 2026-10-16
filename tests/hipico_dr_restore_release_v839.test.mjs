import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { validHipicoDrRestoreEvidence } from '../scripts/hipico-dr-restore-policy-v839.mjs';

const inventoryBytes=readFileSync(new URL('../ops/backup/hipico-public-tables.txt',import.meta.url));
const tableHash=crypto.createHash('sha256').update(inventoryBytes).digest('hex');
const tables=inventoryBytes.toString('utf8').split(/\r?\n/).map(t=>t.trim()).filter(t=>t&&!t.startsWith('#'));
const candidateSha='a'.repeat(40);
const fixture=()=>({
  schema:'hipico-schema-backup-evidence.v17',candidateSha,status:'PASS',
  restoreVerified:true,backupId:'isolated-fixture-not-operational',
  restoreTestId:'local-fixture-not-operational',targetDatabase:'isolated_drill',
  checkedAt:new Date().toISOString(),scope:'hipico-canonical-v12-v27',
  migrationChain:'v12-v27',tableManifestSha256:tableHash,
  mode:'STEADY_STATE',canonicalTableCount:25,sourceTableCount:25,
  tableCount:25,presentTables:[...tables],deferredTables:[],
  orphanForeignKeys:0,reasons:[]
});

test('#839 pure gate requires exact canonical 25/25 restored inventory',()=>{
  assert.equal(tables.length,25);
  assert.equal(validHipicoDrRestoreEvidence(fixture(),tableHash,tables),true);
});

test('#839 missing, partial or deferred backup cannot authorize stable release',()=>{
  for(const partial of [
    null,{...fixture(),mode:'PRE_ROLLOUT'},
    {...fixture(),sourceTableCount:24},
    {...fixture(),deferredTables:[tables[0]]},
    {...fixture(),presentTables:tables.slice(1)},
    {...fixture(),restoreVerified:false},
    {...fixture(),status:'NOT_EXECUTED'},
    {...fixture(),orphanForeignKeys:1},
    {...fixture(),reasons:['COUNT_MISMATCH']},
    {...fixture(),tableManifestSha256:'b'.repeat(64)},
    {...fixture(),checkedAt:new Date(Date.now()+3600000).toISOString()},
    {...fixture(),presentTables:[...tables.slice(1),'hipico_noncanonical']},
  ]) assert.equal(validHipicoDrRestoreEvidence(partial,tableHash,tables),false);
});

test('#839 release verifier obtains DR PASS only from exact-SHA validated restore artifact',()=>{
  const verifier=readFileSync(new URL('../scripts/hipico-verify-evidence-v290.mjs',import.meta.url),'utf8');
  const report=readFileSync(new URL('../scripts/hipico-release-report-v290.mjs',import.meta.url),'utf8');
  assert.match(verifier,/id: 'drRestore'/);
  assert.match(verifier,/name: 'backup-evidence\.json'/);
  assert.match(verifier,/validHipicoDrRestoreEvidence\(data, canonicalInventorySha256, canonicalInventoryTables\)/);
  assert.match(report,/drRestoreArtifact = status\(optionalEvidence.find/);
  assert.match(report,/drRestore: drRestoreArtifact/);
  assert.match(report,/stableRequired = \[\.\.\.codeReviewRequired[^\n]+drRestore/);
  assert.doesNotMatch(report,/HIPICO_GATE_DR_RESTORE/);
});
