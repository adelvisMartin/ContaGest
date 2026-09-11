import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BRIDGE_SPOOL_KINDS, createBridgeSpoolRuntime } from '../src/spool-runtime.mjs';

async function fixture(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-replay-guard-'));
  const runtime=createBridgeSpoolRuntime({
    rootDir:path.join(dir,'spool-v2'),
    parserVersion:'bridge-v1',
    maxAttempts:1,
    jitter:0,
    now:()=>Date.parse('2026-09-11T12:00:00Z')
  });
  await runtime.initialize();
  const queued=await runtime.queueLabMirror({sourceExternalMessageId:'mirror-guard-1',text:'lab test'});
  await runtime.flushLab(async()=>{const error=new Error('lab down');error.retryable=true;throw error;});
  return{dir,runtime,recordId:queued.record.recordId};
}

test('runtime replay plan independently rejects invalid limits and time windows',async()=>{
  const f=await fixture();
  const base={kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'control-hipico-lab',expectedDestination:'control-hipico-lab'};
  await assert.rejects(()=>f.runtime.replayPlan({...base,limit:Number.NaN}),/REPLAY_LIMIT_INVALID/);
  await assert.rejects(()=>f.runtime.replayPlan({...base,limit:1001}),/REPLAY_LIMIT_INVALID/);
  await assert.rejects(()=>f.runtime.replayPlan({...base,from:'2026-09-11'}),/REPLAY_FROM_INVALID/);
  await assert.rejects(()=>f.runtime.replayPlan({...base,from:'2026-09-11T13:00:00Z',to:'2026-09-11T12:00:00Z'}),/REPLAY_RANGE_INVALID/);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('runtime rejects duplicate replay IDs before any state mutation',async()=>{
  const f=await fixture();
  const base={kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'control-hipico-lab',expectedDestination:'control-hipico-lab'};
  await assert.rejects(
    ()=>f.runtime.requestReplay({...base,recordIds:[f.recordId,f.recordId],expectedCount:2}),
    /REPLAY_RECORD_IDS_DUPLICATED/
  );
  const found=await f.runtime.findRecord(f.recordId);
  assert.equal(found.record.state,'quarantined');
  assert.equal(found.record.replayRequestedAt,undefined);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('runtime preflights every requested record before moving the first one',async()=>{
  const f=await fixture();
  const base={kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'control-hipico-lab',expectedDestination:'control-hipico-lab'};
  await assert.rejects(
    ()=>f.runtime.requestReplay({...base,recordIds:[f.recordId,'missing-record'],expectedCount:2}),
    /REPLAY_RECORD_NOT_ELIGIBLE:missing-record/
  );
  const found=await f.runtime.findRecord(f.recordId);
  assert.equal(found.record.state,'quarantined');
  assert.equal(found.record.replayRequestedAt,undefined);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('normal bounded replay still requeues and delivers to the pinned LAB destination',async()=>{
  const f=await fixture();
  const base={kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'control-hipico-lab',expectedDestination:'control-hipico-lab'};
  const plan=await f.runtime.replayPlan({...base,limit:100});
  assert.deepEqual(plan.eligible.map((row)=>row.recordId),[f.recordId]);
  const replay=await f.runtime.requestReplay({...base,recordIds:[f.recordId],expectedCount:1});
  assert.equal(replay.queued,1);
  let delivered=0;
  await f.runtime.flushLab(async()=>{delivered+=1;});
  assert.equal(delivered,1);
  const found=await f.runtime.findRecord(f.recordId);
  assert.equal(found.record.state,'replayed');
  await fs.rm(f.dir,{recursive:true,force:true});
});
