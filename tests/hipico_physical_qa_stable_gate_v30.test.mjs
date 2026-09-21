import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const catalog=JSON.parse(fs.readFileSync('products/hipico-control/physical-qa-v119.json','utf8'));
const recorder='scripts/hipico-physical-qa-v119.mjs';
const run=(argv,sha)=>spawnSync(process.execPath,[recorder,...argv],{
  encoding:'utf8',
  env:{...process.env,GITHUB_SHA:'',VERCEL_GIT_COMMIT_SHA:'',GIT_SHA:sha}
});
const read=(relative)=>fs.readFileSync(relative,'utf8');

function completePhysicalQa(dir,file,sha){
  const proof='proof.log';
  fs.writeFileSync(path.join(dir,proof),'physical material evidence');
  const sourceHash='1'.repeat(64);
  const labHash='2'.repeat(64);
  assert.equal(run(['init',`--file=${file}`,'--force','--operator=QA Operador'],sha).status,0);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']]){
    assert.equal(run([
      'add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=Device',
      `--source-session-hash=${sourceHash}`,`--lab-session-hash=${labHash}`
    ],sha).status,0);
  }
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const env of raw.environments){
    for(const scenario of catalog.scenarios){
      env.scenarios[scenario.id]={status:'PASS',severity:null,notes:'verified',evidence:[proof]};
    }
  }
  raw.invariants={sourceReadOnly:'PASS',labOnlyWriteDestination:'PASS',sessionFallbackSafe:'PASS'};
  raw.invariantEvidence={sourceReadOnly:[proof],labOnlyWriteDestination:[proof],sessionFallbackSafe:[proof]};
  fs.writeFileSync(file,`${JSON.stringify(raw,null,2)}\n`);
}

test('v30 successful physical QA check emits canonical exact-SHA release evidence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v30-'));
  const file=path.join(dir,'physical-qa.json');
  const sha='a'.repeat(40);
  completePhysicalQa(dir,file,sha);
  const checked=run(['check',`--file=${file}`],sha);
  assert.equal(checked.status,0,checked.stderr);
  const evidencePath=path.join(dir,'physical-qa-evidence.json');
  assert.ok(fs.existsSync(evidencePath),'canonical physical QA release evidence missing');
  const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
  assert.equal(evidence.schema,'hipico-physical-qa-evidence.v119');
  assert.equal(evidence.candidateSha,sha);
  assert.equal(evidence.status,'PASS');
  assert.ok(evidence.completedAt);
  assert.equal(evidence.operator,'QA Operador');
  assert.deepEqual(evidence.requiredModes,['pwa-browser','pwa-standalone','android-apk']);
  assert.equal(evidence.summary.releasePhysicalGate,'PASS');
  assert.equal(evidence.summary.materialEvidenceComplete,true);
  assert.deepEqual(evidence.invariants,{
    sourceReadOnly:'PASS',
    labOnlyWriteDestination:'PASS',
    sessionFallbackSafe:'PASS'
  });
  assert.ok(Array.isArray(evidence.evidenceFiles)&&evidence.evidenceFiles.length>0);
  assert.ok(evidence.evidenceFiles.every((row)=>/^[a-f0-9]{64}$/.test(row.sha256)));
});

test('v30 physical QA verifier indexes only canonical PASS evidence as optional exact-SHA gate',()=>{
  const source=read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(source,/id:\s*'physicalQa'/);
  assert.match(source,/name:\s*'physical-qa-evidence\.json'/);
  assert.match(source,/schemas:\s*\['hipico-physical-qa-evidence\.v119'\]/);
  assert.match(source,/summary\?\.releasePhysicalGate\s*===\s*'PASS'/);
  assert.match(source,/summary\?\.materialEvidenceComplete\s*===\s*true/);
  assert.match(source,/data\?\.completedAt/);
  assert.match(source,/data\?\.operator/);
  assert.match(source,/requiredModes/);
  assert.match(source,/sourceReadOnly/);
  assert.match(source,/labOnlyWriteDestination/);
  assert.match(source,/sessionFallbackSafe/);
  const requiredBlock=source.slice(source.indexOf('const requiredDescriptors'),source.indexOf('const optionalDescriptors'));
  assert.doesNotMatch(requiredBlock,/physicalQa/);
});

test('v30 release report derives Physical QA only from verified artifact',()=>{
  const source=read('scripts/hipico-release-report-v290.mjs');
  assert.match(source,/physicalQaArtifact/);
  assert.match(source,/id\s*===\s*'physicalQa'/);
  assert.match(source,/physicalQa:\s*physicalQaArtifact/);
  assert.doesNotMatch(source,/HIPICO_GATE_PHYSICAL_QA/);
  const codeReview=source.match(/const codeReviewRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(codeReview);
  assert.doesNotMatch(codeReview[1],/physicalQa/);
  const stable=source.match(/const stableRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(stable);
  assert.match(stable[1],/physicalQa/);
});

test('v30 production workflow has no manual Physical QA PASS selector',()=>{
  const workflow=read('.github/workflows/hipico-production-gates-v290.yml');
  assert.doesNotMatch(workflow,/physical_qa_status:/);
  assert.doesNotMatch(workflow,/HIPICO_PHYSICAL_QA_STATUS/);
  assert.doesNotMatch(workflow,/HIPICO_GATE_PHYSICAL_QA/);
});
