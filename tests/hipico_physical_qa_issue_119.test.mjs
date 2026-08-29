import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const catalog=JSON.parse(fs.readFileSync('products/hipico-control/physical-qa-v119.json','utf8'));

test('physical catalog contains all critical lifecycle/source-lab scenarios',()=>{
  const ids=new Set(catalog.scenarios.map((row)=>row.id));
  for(const id of ['fresh-install','upgrade-install','foreground-background','process-kill','reboot','permissions','offline-reconnect','source-lab-two-sessions','source-to-lab-e2e-day-1','source-to-lab-e2e-day-2','backup-restore-device','handoff-restart'])assert.ok(ids.has(id),id);
  assert.equal(catalog.requiredSessionTopology.source,'read-only');
  assert.equal(catalog.requiredSessionTopology.lab,'only-write-destination-during-gate');
});

test('fresh physical template is NOT_READY rather than fake PASS',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-'));
  const file=path.join(dir,'physical.json');
  const sha='a'.repeat(40);
  const init=spawnSync(process.execPath,['scripts/hipico-physical-qa-v119.mjs','init',`--file=${file}`,'--force'],{encoding:'utf8',env:{...process.env,GIT_SHA:sha}});
  assert.equal(init.status,0,init.stderr);
  const status=spawnSync(process.execPath,['scripts/hipico-physical-qa-v119.mjs','status',`--file=${file}`],{encoding:'utf8',env:{...process.env,GIT_SHA:sha}});
  assert.equal(status.status,0,status.stderr);
  const result=JSON.parse(status.stdout);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
  assert.equal(result.counts.NOT_EXECUTED,catalog.scenarios.length);
  const check=spawnSync(process.execPath,['scripts/hipico-physical-qa-v119.mjs','check',`--file=${file}`],{encoding:'utf8',env:{...process.env,GIT_SHA:sha}});
  assert.equal(check.status,3);
});

test('unknown or malformed status fails validation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-v119-invalid-'));
  const file=path.join(dir,'physical.json');
  const sha='b'.repeat(40);
  spawnSync(process.execPath,['scripts/hipico-physical-qa-v119.mjs','init',`--file=${file}`,'--force'],{env:{...process.env,GIT_SHA:sha}});
  const result=JSON.parse(fs.readFileSync(file,'utf8'));
  result.scenarios['fresh-install'].status='GREEN';
  fs.writeFileSync(file,JSON.stringify(result));
  const status=spawnSync(process.execPath,['scripts/hipico-physical-qa-v119.mjs','status',`--file=${file}`],{encoding:'utf8',env:{...process.env,GIT_SHA:sha}});
  assert.equal(status.status,1);
  assert.match(status.stderr,/status inválido/);
});
