import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const catalog=JSON.parse(fs.readFileSync('products/hipico-control/physical-qa-v119.json','utf8'));
const policy=JSON.parse(fs.readFileSync('products/hipico-control/release-policy.json','utf8'));
const script='scripts/hipico-physical-qa-v119.mjs';
const sha='a'.repeat(40);
const run=(argv)=>spawnSync(process.execPath,[script,...argv],{
  encoding:'utf8',env:{...process.env,GITHUB_SHA:'',VERCEL_GIT_COMMIT_SHA:'',GIT_SHA:sha}
});
const one='source-to-lab-e2e-day-1',two='source-to-lab-e2e-day-2';
const day1=()=>new Date(Date.now()-3*86400000).toISOString();
const day2=()=>new Date(Date.now()-86400000).toISOString();
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-two-day-v119-'));
  const file=path.join(dir,'physical.json');
  fs.writeFileSync(path.join(dir,'common.log'),'synthetic QA common scenario');
  fs.writeFileSync(path.join(dir,'day-1.log'),'synthetic first day');
  fs.writeFileSync(path.join(dir,'day-2.log'),'synthetic second day');
  assert.equal(run(['init',`--file=${file}`,'--force','--operator=Test Fixture']).status,0);
  for(const [id,mode] of [['browser','pwa-browser'],['pwa','pwa-standalone'],['apk','android-apk']]){
    const options=['add-env',`--file=${file}`,`--id=${id}`,`--mode=${mode}`,'--device=synthetic',
      `--source-session-hash=${'1'.repeat(64)}`,`--lab-session-hash=${'2'.repeat(64)}`];
    if(mode==='android-apk')options.push(`--apk-version=${policy.version}`,`--apk-sha256=${'a'.repeat(64)}`);
    const step=run(options);
    assert.equal(step.status,0,step.stderr);
  }
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const env of raw.environments){
    for(const entry of catalog.scenarios){
      const isOne=entry.id===one,isTwo=entry.id===two;
      env.scenarios[entry.id]={
        status:'PASS',severity:null,notes:'synthetic fixture only',
        evidence:[isOne?'day-1.log':isTwo?'day-2.log':'common.log'],
        ...((isOne||isTwo)?{observedAtUtc:isOne?day1():day2()}:{})
      };
    }
  }
  raw.invariants={sourceReadOnly:'PASS',labOnlyWriteDestination:'PASS',sessionFallbackSafe:'PASS'};
  raw.invariantEvidence={sourceReadOnly:['common.log'],labOnlyWriteDestination:['common.log'],sessionFallbackSafe:['common.log']};
  fs.writeFileSync(file,JSON.stringify(raw,null,2));
  return{dir,file,raw};
}
function update(f,callback) {
  const result=JSON.parse(fs.readFileSync(f.file,'utf8'));
  callback(result);
  fs.writeFileSync(f.file,JSON.stringify(result,null,2));
}
function status(f){
  const output=run(['status',`--file=${f.file}`]);
  assert.equal(output.status,0,output.stderr);
  return JSON.parse(output.stdout);
}
function check(f){return run(['check',`--file=${f.file}`]);}

test('#119 distinct physical observation dates and files allow synthetically valid recorder fixture',()=>{
  const f=fixture();
  const result=status(f);
  assert.equal(result.twoDayEvidenceComplete,true);
  assert.deepEqual(result.twoDayEvidenceErrors,[]);
  assert.equal(result.releasePhysicalGate,'PASS');
  const checked=check(f);
  assert.equal(checked.status,0,checked.stderr);
  assert.ok(fs.existsSync(path.join(f.dir,'physical-qa-evidence.json')));
});

test('#119 identical evidence path reused for both journeys cannot yield physical PASS',()=>{
  const f=fixture();
  update(f,r=>{for(const env of r.environments)env.scenarios[two].evidence=['day-1.log'];});
  const result=status(f);
  assert.equal(result.twoDayEvidenceComplete,false);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
  assert.match(result.twoDayEvidenceErrors.join(' '),/SHA-256 independientes/);
  assert.equal(check(f).status,3);
  assert.equal(fs.existsSync(path.join(f.dir,'physical-qa-evidence.json')),false);
});

test('#119 copies under two file paths with identical bytes cannot certify independent days',()=>{
  const f=fixture();
  fs.copyFileSync(path.join(f.dir,'day-1.log'),path.join(f.dir,'day-2.log'));
  const result=status(f);
  assert.equal(result.twoDayEvidenceComplete,false);
  assert.equal(result.releasePhysicalGate,'NOT_READY');
  assert.equal(check(f).status,3);
});

test('#119 two observations less than 24 hours apart cannot certify separate days',()=>{
  const f=fixture();
  update(f,r=>{for(const env of r.environments)env.scenarios[two].observedAtUtc=
    new Date(Date.parse(env.scenarios[one].observedAtUtc)+23*3600000).toISOString();});
  assert.match(status(f).twoDayEvidenceErrors.join(' '),/>=24 horas/);
  assert.equal(status(f).releasePhysicalGate,'NOT_READY');
});

test('#119 missing dates, naive timestamps and reversed chronology fail closed',()=>{
  for(const change of [
    r=>{delete r.environments[0].scenarios[one].observedAtUtc;},
    r=>{r.environments[0].scenarios[one].observedAtUtc='2026-10-16T12:00:00Z';},
    r=>{r.environments[0].scenarios[one].observedAtUtc='2026-02-30T12:00:00.000Z';},
    r=>{r.environments[0].scenarios[two].observedAtUtc=
      new Date(Date.parse(r.environments[0].scenarios[one].observedAtUtc)-86400000).toISOString();}
  ]){
    const f=fixture();update(f,change);
    assert.equal(status(f).releasePhysicalGate,'NOT_READY');
    assert.equal(status(f).twoDayEvidenceComplete,false);
  }
});

test('#119 future-dated observation is not treated as physical evidence',()=>{
  const f=fixture();
  update(f,r=>{r.environments[0].scenarios[two].observedAtUtc=
    new Date(Date.now()+86400000).toISOString();});
  assert.match(status(f).twoDayEvidenceErrors.join(' '),/futuro/);
  assert.equal(check(f).status,3);
});

test('#119 record CLI persists explicit observation instant without fabricating PASS',()=>{
  const f=fixture();
  const when=day1();
  const out=run(['record',`--file=${f.file}`,'--env=browser',
    `--scenario=${one}`,'--status=PASS','--evidence=day-1.log',`--observed-at=${when}`]);
  assert.equal(out.status,0,out.stderr);
  const raw=JSON.parse(fs.readFileSync(f.file,'utf8'));
  assert.equal(raw.environments.find(e=>e.id==='browser').scenarios[one].observedAtUtc,when);
  assert.equal(status(f).twoDayEvidenceComplete,true);
});
