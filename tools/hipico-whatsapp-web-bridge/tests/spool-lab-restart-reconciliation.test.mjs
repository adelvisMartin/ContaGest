import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBridgeSpoolRuntime,BRIDGE_SPOOL_KINDS} from '../src/spool-runtime.mjs';
import {atomicWriteJson} from '../src/spool-journal.mjs';

async function fixture(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-lab-restart-'));
  const rootDir=path.join(dir,'spool-v2');
  let clock=Date.UTC(2026,9,12,12,0,0);
  const make=()=>createBridgeSpoolRuntime({
    rootDir,parserVersion:'whatsapp-parser-v1',now:()=>clock,
    baseMs:1000,maxMs:10000,jitter:0,random:()=>.5
  });
  const runtime=make();
  await runtime.initialize();
  const mirror={sourceExternalMessageId:'lab-event-01',mirrorTag:'[SHADOW:lab-01]',labGroupName:'pinned-lab',text:'synthetic only'};
  return{dir,rootDir,runtime,make,mirror,advance:(ms)=>{clock+=ms;},clean:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('LAB mirror is durably sending BEFORE transport callback and then sent after confirmed receipt',async()=>{
  const f=await fixture();
  try{
    const queued=await f.runtime.queueLabMirror(f.mirror);
    const callbacks=[];
    const result=await f.runtime.flushLab(async(payload,record)=>{
      assert.equal(payload.mirrorTag,f.mirror.mirrorTag);
      assert.equal(record.state,'sending');
      assert.ok(record.sendStartedAt);
      assert.equal((await f.runtime.findRecord(record.recordId)).record.state,'sending');
      callbacks.push(record.recordId);
    });
    assert.equal(result.delivered,1);
    assert.deepEqual(callbacks,[queued.record.recordId]);
    const after=await f.runtime.findRecord(queued.record.recordId);
    assert.equal(after.record.state,'sent');
    assert.equal((await f.make().initialize()).interruptedLab,0);
    assert.equal((await f.runtime.flushLab(async()=>{throw Error('duplicate');})).attempted,0);
  }finally{await f.clean();}
});

test('confirmed pre-Enter failure is retryable with backoff, without false ambiguity',async()=>{
  const f=await fixture();
  try{
    await f.runtime.queueLabMirror(f.mirror);
    let attempts=0;
    const bad=new Error('LAB_PRE_SEND_RETRYABLE');
    bad.code='LAB_PRE_SEND_RETRYABLE';
    bad.retryable=true;
    const first=await f.runtime.flushLab(async()=>{attempts+=1;throw bad;});
    assert.equal(first.failed,1);
    assert.equal((await f.runtime.snapshot()).byKind['lab-mirror'].failed,1);
    assert.equal((await f.runtime.flushLab(async()=>{attempts+=1;})).attempted,0);
    f.advance(1000);
    const retry=await f.runtime.flushLab(async()=>{attempts+=1;});
    assert.equal(retry.delivered,1);
    assert.equal(attempts,2);
    assert.equal((await f.runtime.snapshot()).byKind['lab-mirror'].sent,1);
  }finally{await f.clean();}
});

test('post-Enter ambiguity is quarantined and cannot be requeued even with matching destination',async()=>{
  const f=await fixture();
  try{
    const queued=await f.runtime.queueLabMirror(f.mirror);
    const err=new Error('do not retry possible sent content');
    err.code='LAB_DELIVERY_AMBIGUOUS';err.retryable=false;
    const result=await f.runtime.flushLab(async()=>{throw err;});
    assert.equal(result.quarantined,1);
    const after=await f.runtime.findRecord(queued.record.recordId);
    assert.equal(after.record.state,'quarantined');
    assert.equal(after.record.lastError,'LAB_DELIVERY_AMBIGUOUS');
    let sends=0;
    assert.equal((await f.runtime.flushLab(async()=>{sends++;})).attempted,0);
    assert.equal((await f.make().initialize()).interruptedLab,0);
    const base={kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'pinned-lab-key',expectedDestination:'pinned-lab-key'};
    const plan=await f.runtime.replayPlan(base);
    assert.equal(plan.count,0);
    assert.deepEqual(plan.skipped.map(x=>x.reason),['LAB_DELIVERY_RECONCILIATION_REQUIRED']);
    await assert.rejects(()=>f.runtime.requestReplay({...base,recordIds:[queued.record.recordId],expectedCount:1}),/REPLAY_LAB_AMBIGUOUS_RECONCILIATION_REQUIRED/);
    assert.equal(sends,0);
  }finally{await f.clean();}
});

test('restart with durable sending intent moves LAB record to review-only quarantine without delivery',async()=>{
  const f=await fixture();
  try{
    const queued=await f.runtime.queueLabMirror(f.mirror);
    const from=path.join(f.rootDir,'queued',queued.record.recordId+'.json');
    const to=path.join(f.rootDir,'sending',queued.record.recordId+'.json');
    await atomicWriteJson(to,{...queued.record,state:'sending',sendStartedAt:'2026-10-12T12:00:00Z'});
    await fs.rm(from);
    const restarted=f.make();
    assert.equal((await restarted.initialize()).interruptedLab,1);
    const found=await restarted.findRecord(queued.record.recordId);
    assert.equal(found.record.state,'quarantined');
    assert.equal(found.record.quarantineReason,'LAB_SEND_INTERRUPTED');
    assert.equal(found.record.lastError,'LAB_DELIVERY_AMBIGUOUS');
    assert.ok(found.record.interruptedAt);
    assert.equal((await restarted.initialize()).interruptedLab,0);
    let sends=0;
    assert.equal((await restarted.flushLab(async()=>{sends++;})).attempted,0);
    assert.equal(sends,0);
  }finally{await f.clean();}
});

test('crash between writing sending and removing queued blocks duplicate active work',async()=>{
  const f=await fixture();
  try{
    const queued=await f.runtime.queueLabMirror(f.mirror);
    const sendFile=path.join(f.rootDir,'sending',queued.record.recordId+'.json');
    await atomicWriteJson(sendFile,{...queued.record,state:'sending',sendStartedAt:'2026-10-12T12:00:00Z'});
    const restarted=f.make();
    assert.equal((await restarted.initialize()).interruptedLab,1);
    let sends=0;
    assert.equal((await restarted.flushLab(async()=>{sends++;})).attempted,0);
    assert.equal(sends,0);
    const states=await restarted.snapshot();
    assert.equal(states.byKind['lab-mirror'].quarantined,1);
    assert.equal(states.byKind['lab-mirror'].queued,1); // retained for forensic recovery, not sent
  }finally{await f.clean();}
});

test('backend event delivery still uses existing idempotent path, not LAB uncertain-send state',async()=>{
  const f=await fixture();
  try{
    await f.runtime.queueBackendEvent({channelKey:'source',externalMessageId:'event-only'});
    let sends=0;
    const result=await f.runtime.flushBackend(async(_payload,record)=>{
      sends+=1;assert.equal(record.state,'queued');
    });
    assert.equal(result.delivered,1);
    assert.equal(sends,1);
    assert.equal((await f.runtime.snapshot()).byKind['backend-event'].sending,0);
    assert.equal((await f.runtime.snapshot()).byKind['backend-event'].sent,1);
  }finally{await f.clean();}
});
