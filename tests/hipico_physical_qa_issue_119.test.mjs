import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const catalog=JSON.parse(fs.readFileSync('products/hipico-control/physical-qa-v119.json','utf8'));
const script='scripts/hipico-physical-qa-v119.mjs';
const run=(argv,sha)=>spawnSync(process.execPath,[script,...argv],{encoding:'utf8',env:{...process.env,GIT_SHA:sha}});

test('physical catalog contains all critical lifecycle/source-lab scenarios',()=>{
  const ids=new Set(catalog.scenarios.map((row)=>row.id));
  for(const id of ['fresh-install','upgrade-install','foreground-background','process-kill','reboot','permissions','offline-reconnect','source-lab-two-sessions','source-to-lab-e2e-day-1','source-to-lab-e2e-day-2','backup-restore-device','handoff-restart'])assert.ok(ids.has(id),id);
  assert.equal(catalog.requiredSessionTopology.source,'read-only');
  assert.equal(catalog.requiredSessionTopology.lab,'only-write-destination-during-gate');
  assert.deepEqual(catalog.requiredModes,['pwa-browser','pwa-standalone','android-apk']);
});

test('fresh physical template is NOT_READY and requires all modes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-'));
  const file=path.join(dir,'physical.json');
  const sha='a'.repeat(40);
  const init=run(['init',`--file=${file}`,'--force'],sha);
  assert.equal(init.status,0,init.stderr);
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(raw.schemaVersion,2);
  assert.deepEqual(raw.environments,[]);
  assert.deepEqual(raw.invariantEvidence,{sourceReadOnly:[],labOnlyWriteDestination:[],sessionFallbackSafe:[]});
  const status=run(['status',`--file=${file}`],sha);
  assert.equal(status.status,1);
  assert.match(status.stderr,/Falta environment requerido/);
});

test('three required modes create a real device-mode scenario matrix',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-matrix-'));
  const file=path.join(dir,'physical.json');
  const sha='b'.repeat(40);
  assert.equal(run(['init',`--file=${file}`,'--force'],sha).status,0);
  assert.equal(run(['add-env',`--file=${file}`,'--id=chrome-desktop','--mode=pwa-browser','--device=Desktop Chrome'],sha).status,0);
  assert.equal(run(['add-env',`--file=${file}`,'--id=pwa-phone','--mode=pwa-standalone','--device=Android PWA'],sha).status,0);
  assert.equal(run(['add-env',`--file=${file}`,'--id=apk-phone','--mode=android-apk','--device=Android APK'],sha).status,0);
  const status=run(['status',`--file=${file}`],sha);
  assert.equal(status.status,0,status.stderr);
  const result=JSON.parse(status.stdout);
  assert.equal(result.environments,3);
  assert.equal(result.totalCases,catalog.scenarios.length*3);
  assert.equal(result.counts.NOT_EXECUTED,catalog.scenarios.length*3);
  assert.equal(result.requiredModesCovered,true);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
});

test('record command updates exactly one environment/scenario',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-record-'));
  const file=path.join(dir,'physical.json');
  const sha='c'.repeat(40);
  run(['init',`--file=${file}`,'--force'],sha);
  run(['add-env',`--file=${file}`,'--id=chrome-desktop','--mode=pwa-browser','--device=Desktop'],sha);
  const record=run(['record',`--file=${file}`,'--env=chrome-desktop','--scenario=fresh-install','--status=PASS','--notes=ok'],sha);
  assert.equal(record.status,0,record.stderr);
  const result=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(result.environments[0].scenarios['fresh-install'].status,'PASS');
  assert.equal(result.environments[0].scenarios['upgrade-install'].status,'NOT_EXECUTED');
});

test('unknown status is rejected by record command',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-invalid-'));
  const file=path.join(dir,'physical.json');
  const sha='d'.repeat(40);
  run(['init',`--file=${file}`,'--force'],sha);
  run(['add-env',`--file=${file}`,'--id=chrome-desktop','--mode=pwa-browser','--device=Desktop'],sha);
  const record=run(['record',`--file=${file}`,'--env=chrome-desktop','--scenario=fresh-install','--status=GREEN'],sha);
  assert.equal(record.status,2);
  assert.match(record.stderr,/Status inválido/);
});

test('release readiness requires operator, distinct hashed SOURCE/LAB sessions and evidence for every PASS row',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-identity-'));
  const file=path.join(dir,'physical.json');
  const sha='e'.repeat(40),sourceHash='1'.repeat(64),labHash='2'.repeat(64);
  assert.equal(run(['init',`--file=${file}`,'--force','--operator=QA Operador'],sha).status,0);
  for(const [id,mode,device] of [['browser','pwa-browser','Desktop'],['pwa','pwa-standalone','Android PWA'],['apk','android-apk','Android APK']]){
    assert.equal(run(['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,`--device=${device}`,`--source-session-hash=${sourceHash}`,`--lab-session-hash=${labHash}`],sha).status,0);
  }
  const result=JSON.parse(run(['status',`--file=${file}`],sha).stdout);
  assert.equal(result.operatorPresent,true);
  assert.equal(result.sessionTopologySafe,true);
  assert.equal(result.evidenceComplete,false);
  assert.equal(result.invariantEvidenceComplete,false);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
});

test('same hashed identity for SOURCE and LAB is never considered safe',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-same-session-'));
  const file=path.join(dir,'physical.json');
  const sha='f'.repeat(40),same='3'.repeat(64);
  run(['init',`--file=${file}`,'--force','--operator=QA'],sha);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']])run(['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=Device',`--source-session-hash=${same}`,`--lab-session-hash=${same}`],sha);
  const result=JSON.parse(run(['status',`--file=${file}`],sha).stdout);
  assert.equal(result.sessionTopologySafe,false);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
});

test('PASS safety invariants remain NOT_READY until each one has evidence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-invariant-evidence-'));
  const file=path.join(dir,'physical.json');
  const sha='7'.repeat(40),sourceHash='4'.repeat(64),labHash='5'.repeat(64);
  run(['init',`--file=${file}`,'--force','--operator=QA'],sha);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']])run(['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=Device',`--source-session-hash=${sourceHash}`,`--lab-session-hash=${labHash}`],sha);
  for(const name of ['sourceReadOnly','labOnlyWriteDestination','sessionFallbackSafe'])assert.equal(run(['invariant',`--file=${file}`,`--name=${name}`,'--status=PASS'],sha).status,0);
  const result=JSON.parse(run(['status',`--file=${file}`],sha).stdout);
  assert.equal(result.sourceSafe,true);
  assert.equal(result.invariantEvidenceComplete,false);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
});

test('release check rejects evidence from another otherwise valid candidate SHA',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-sha-'));
  const file=path.join(dir,'physical.json');
  const original='8'.repeat(40),current='9'.repeat(40);
  run(['init',`--file=${file}`,'--force'],original);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']])run(['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=Device'],original);
  const checked=run(['check',`--file=${file}`],current);
  assert.equal(checked.status,1);
  assert.match(checked.stderr,/CANDIDATE_SHA_MISMATCH/);
});

test('check hashes safety invariant evidence into the SHA-bound manifest',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-hash-'));
  const file=path.join(dir,'physical.json');
  const sha='6'.repeat(40);
  run(['init',`--file=${file}`,'--force'],sha);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']])run(['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=Device'],sha);
  fs.writeFileSync(path.join(dir,'source-readonly.log'),'verified');
  run(['invariant',`--file=${file}`,'--name=sourceReadOnly','--status=PASS','--evidence=source-readonly.log'],sha);
  const checked=run(['check',`--file=${file}`],sha);
  assert.equal(checked.status,3,checked.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.ok(manifest.evidenceFiles.some((row)=>row.invariant==='sourceReadOnly'&&row.path==='source-readonly.log'&&/^[a-f0-9]{64}$/.test(row.sha256)));
});
