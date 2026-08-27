import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSpoolRecord,atomicWriteJson,loadSpoolFile,registerFailure,planReplay,validateSpoolRecord,quarantineFile,transitionSpool} from '../src/spool-journal.mjs';

test('atomic write produces one valid record without temp residue',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-spool-'));const file=path.join(dir,'event.json');
  const record=createSpoolRecord({kind:'lab-mirror',key:'m1',payload:{text:'shadow'},parserVersion:'v1'});
  await atomicWriteJson(file,record);
  const loaded=await loadSpoolFile(file,{parserVersion:'v1'});
  assert.equal(loaded.validation.valid,true);assert.equal(loaded.record.key,'m1');
  assert.deepEqual((await fs.readdir(dir)).filter((name)=>name.endsWith('.tmp')),[]);
  await fs.rm(dir,{recursive:true,force:true});
});

test('legacy/incompatible records never become replay eligible automatically',()=>{
  const legacy={key:'old',state:'queued',createdAt:new Date().toISOString()};
  assert.equal(validateSpoolRecord(legacy).valid,false);
  const valid=createSpoolRecord({kind:'lab-mirror',key:'new',payload:{},parserVersion:'v2'});
  const plan=planReplay([legacy,valid],{destination:'lab-pinned',expectedDestination:'lab-pinned'});
  assert.equal(plan.dryRun,true);assert.equal(plan.count,1);assert.equal(plan.skipped.length,1);
});

test('retry budget ends in quarantine and terminal sent cannot be requeued',()=>{
  let record=createSpoolRecord({kind:'event',key:'r1',payload:{},maxAttempts:2});
  record=registerFailure(record,new Error('network'),{baseMs:1000,jitter:0,random:()=>.5});
  assert.equal(record.state,'failed');assert.equal(record.attempts,1);
  record=registerFailure(record,new Error('network'),{baseMs:1000,jitter:0,random:()=>.5});
  assert.equal(record.state,'quarantined');assert.equal(record.attempts,2);
  assert.throws(()=>transitionSpool(transitionSpool(record,'sent'),'queued'),/TERMINAL/);
});

test('replay requires exact pinned destination and shows count before execution',()=>{
  const record=createSpoolRecord({kind:'lab-mirror',key:'m2',payload:{}});
  assert.throws(()=>planReplay([record],{destination:'source-real',expectedDestination:'lab-pinned'}),/DESTINATION_MISMATCH/);
  const plan=planReplay([record],{destination:'lab-pinned',expectedDestination:'lab-pinned',dryRun:true});
  assert.deepEqual({dryRun:plan.dryRun,count:plan.count,destination:plan.destination},{dryRun:true,count:1,destination:'lab-pinned'});
});

test('corrupt file can be isolated without blocking other spool records',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-spool-corrupt-'));const quarantine=path.join(dir,'quarantine');const bad=path.join(dir,'bad.json');
  await fs.writeFile(bad,'{not-json','utf8');const loaded=await loadSpoolFile(bad);
  assert.equal(loaded.validation.valid,false);assert.ok(loaded.validation.errors.includes('CORRUPT_JSON'));
  const moved=await quarantineFile(bad,quarantine,'CORRUPT_JSON');
  assert.equal(path.dirname(moved),quarantine);assert.ok((await fs.readdir(quarantine)).length>=2);
  await fs.rm(dir,{recursive:true,force:true});
});
