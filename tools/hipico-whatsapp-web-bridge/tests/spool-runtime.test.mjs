import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBridgeSpoolRuntime,BRIDGE_SPOOL_KINDS,__test__} from '../src/spool-runtime.mjs';

async function fixture(options={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-runtime-spool-'));
  const legacyEvents=path.join(dir,'spool-events');
  const legacyMirrors=path.join(dir,'spool-lab-mirror');
  const dead=path.join(dir,'dead-letter');
  await Promise.all([legacyEvents,legacyMirrors,dead].map((p)=>fs.mkdir(p,{recursive:true})));
  let nowMs=Date.UTC(2026,7,29,12,0,0);
  const runtime=createBridgeSpoolRuntime({rootDir:path.join(dir,'spool-v2'),legacyEventDir:legacyEvents,legacyMirrorDir:legacyMirrors,legacyDeadLetterDir:dead,parserVersion:'bridge-v1',baseMs:1000,maxMs:10000,jitter:0,random:()=>.5,now:()=>nowMs,...options});
  return{dir,legacyEvents,legacyMirrors,dead,runtime,advance(ms){nowMs+=ms;}};
}

test('same backend event key is idempotent and sent records are not requeued',async()=>{
  const f=await fixture();await f.runtime.initialize();
  const event={channelKey:'source',externalMessageId:'m1',text:'10 a ganador'};
  const first=await f.runtime.queueBackendEvent(event);
  const duplicate=await f.runtime.queueBackendEvent(event);
  assert.equal(first.duplicate,false);assert.equal(duplicate.duplicate,true);
  let calls=0;const result=await f.runtime.flushBackend(async(payload)=>{calls+=1;assert.equal(payload.externalMessageId,'m1');});
  assert.equal(result.delivered,1);assert.equal(calls,1);
  const after=await f.runtime.queueBackendEvent(event);
  assert.equal(after.duplicate,true);assert.equal(after.record.state,'sent');
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('same spool identity rejects different payload content fail-closed',async()=>{
  const f=await fixture();await f.runtime.initialize();
  await f.runtime.queueBackendEvent({channelKey:'source',externalMessageId:'mismatch-1',text:'10 a ganador',meta:{b:2,a:1}});
  const same=await f.runtime.queueBackendEvent({externalMessageId:'mismatch-1',channelKey:'source',meta:{a:1,b:2},text:'10 a ganador'});
  assert.equal(same.duplicate,true);
  await assert.rejects(
    ()=>f.runtime.queueBackendEvent({channelKey:'source',externalMessageId:'mismatch-1',text:'100 a ganador',meta:{a:1,b:2}}),
    (error)=>error?.code==='SPOOL_REPLAY_MISMATCH'&&error?.retryable===false
  );
  const found=await f.runtime.findRecord(same.record.recordId);
  assert.equal(found.record.payload.text,'10 a ganador');
  assert.equal(__test__.payloadFingerprint({b:2,a:1}),__test__.payloadFingerprint({a:1,b:2}));
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('retry is delayed, bounded and ends quarantined',async()=>{
  const f=await fixture({maxAttempts:2});await f.runtime.initialize();
  await f.runtime.queueBackendEvent({channelKey:'source',externalMessageId:'m2'});
  let result=await f.runtime.flushBackend(async()=>{const error=new Error('network');error.retryable=true;throw error;});
  assert.equal(result.failed,1);
  result=await f.runtime.flushBackend(async()=>{throw new Error('should not run before due');});
  assert.equal(result.attempted,0);
  f.advance(1000);
  result=await f.runtime.flushBackend(async()=>{const error=new Error('network');error.retryable=true;throw error;});
  assert.equal(result.quarantined,1);
  const snap=await f.runtime.snapshot();assert.equal(snap.quarantined,1);assert.equal(snap.pendingBackend,0);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('legacy event and mirror files are quarantined and archived, never auto-delivered',async()=>{
  const f=await fixture();
  await fs.writeFile(path.join(f.legacyEvents,'old-event.json'),JSON.stringify({event:{channelKey:'source',externalMessageId:'old-1',text:'legacy'},queuedAt:'2026-08-20T00:00:00.000Z'}));
  await fs.writeFile(path.join(f.legacyMirrors,'old-mirror.json'),JSON.stringify({sourceExternalMessageId:'old-2',text:'legacy mirror'}));
  const init=await f.runtime.initialize();assert.equal(init.events.migrated,1);assert.equal(init.mirrors.migrated,1);
  let backendCalls=0;let labCalls=0;
  assert.equal((await f.runtime.flushBackend(async()=>{backendCalls+=1;})).attempted,0);
  assert.equal((await f.runtime.flushLab(async()=>{labCalls+=1;})).attempted,0);
  assert.equal(backendCalls,0);assert.equal(labCalls,0);
  const snap=await f.runtime.snapshot();assert.equal(snap.quarantined,2);
  assert.deepEqual((await fs.readdir(f.legacyEvents)).filter((x)=>x.endsWith('.json')),[]);
  assert.deepEqual((await fs.readdir(f.legacyMirrors)).filter((x)=>x.endsWith('.json')),[]);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('corrupt legacy file is isolated without blocking valid migration',async()=>{
  const f=await fixture();
  await fs.writeFile(path.join(f.legacyEvents,'bad.json'),'{nope');
  await fs.writeFile(path.join(f.legacyEvents,'good.json'),JSON.stringify({event:{channelKey:'source',externalMessageId:'good'}}));
  const init=await f.runtime.initialize();assert.equal(init.events.corrupt,1);assert.equal(init.events.migrated,1);
  const snap=await f.runtime.snapshot();assert.equal(snap.quarantined,2);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('manual replay requires exact destination and expected count before requeue',async()=>{
  const f=await fixture({maxAttempts:1});await f.runtime.initialize();
  await f.runtime.queueLabMirror({sourceExternalMessageId:'mirror-1',text:'hello'});
  await f.runtime.flushLab(async()=>{const error=new Error('lab down');error.retryable=true;throw error;});
  await assert.rejects(()=>f.runtime.replayPlan({kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'source-real',expectedDestination:'lab-pinned'}),/DESTINATION_MISMATCH/);
  const plan=await f.runtime.replayPlan({kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'lab-pinned',expectedDestination:'lab-pinned'});
  assert.equal(plan.count,1);assert.equal(plan.dryRun,true);
  await assert.rejects(()=>f.runtime.requestReplay({kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'lab-pinned',expectedDestination:'lab-pinned',recordIds:plan.eligible.map((r)=>r.recordId),expectedCount:2}),/COUNT_MISMATCH/);
  const queued=await f.runtime.requestReplay({kind:BRIDGE_SPOOL_KINDS.LAB_MIRROR,destination:'lab-pinned',expectedDestination:'lab-pinned',recordIds:plan.eligible.map((r)=>r.recordId),expectedCount:1});
  assert.equal(queued.queued,1);
  let delivered=0;await f.runtime.flushLab(async()=>{delivered+=1;});assert.equal(delivered,1);
  const found=await f.runtime.findRecord(plan.eligible[0].recordId);assert.equal(found.record.state,'replayed');
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('non-retryable backend errors quarantine immediately',async()=>{
  const f=await fixture();await f.runtime.initialize();
  await f.runtime.queueBackendEvent({channelKey:'source',externalMessageId:'bad-request'});
  const result=await f.runtime.flushBackend(async()=>{const error=new Error('invalid');error.retryable=false;throw error;});
  assert.equal(result.quarantined,1);assert.equal((await f.runtime.snapshot()).pendingBackend,0);
  await fs.rm(f.dir,{recursive:true,force:true});
});


test('source replies are durable, idempotent and never duplicated after confirmed delivery',async()=>{
  const f=await fixture();await f.runtime.initialize();
  const reply={replyId:'resp_12345678',sourceMessageId:'source-1',groupId:'120363111111111111@g.us',text:'Respuesta automática'};
  const first=await f.runtime.queueSourceReply(reply);
  const duplicate=await f.runtime.queueSourceReply(reply);
  assert.equal(first.duplicate,false);
  assert.equal(duplicate.duplicate,true);
  assert.equal((await f.runtime.snapshot()).pendingSourceReplies,1);

  let calls=0;
  const flushed=await f.runtime.flushSourceReplies(async(payload)=>{
    calls+=1;
    assert.equal(payload.replyId,reply.replyId);
    assert.equal(payload.groupId,reply.groupId);
  });
  assert.equal(flushed.delivered,1);
  assert.equal(calls,1);
  assert.equal((await f.runtime.snapshot()).pendingSourceReplies,0);

  const after=await f.runtime.queueSourceReply(reply);
  assert.equal(after.duplicate,true);
  assert.equal(after.record.state,'sent');
  const secondFlush=await f.runtime.flushSourceReplies(async()=>{calls+=1;});
  assert.equal(secondFlush.attempted,0);
  assert.equal(calls,1);
  await fs.rm(f.dir,{recursive:true,force:true});
});

test('source reply identity cannot be reused with altered text or destination',async()=>{
  const f=await fixture();await f.runtime.initialize();
  const reply={replyId:'resp_abcdefgh',sourceMessageId:'source-2',groupId:'120363111111111111@g.us',text:'Texto uno'};
  await f.runtime.queueSourceReply(reply);

  await assert.rejects(
    ()=>f.runtime.queueSourceReply({...reply,text:'Texto alterado'}),
    (error)=>error?.code==='SPOOL_REPLAY_MISMATCH'&&error?.retryable===false
  );
  await assert.rejects(
    ()=>f.runtime.queueSourceReply({...reply,groupId:'120363222222222222@g.us'}),
    (error)=>error?.code==='SPOOL_REPLAY_MISMATCH'&&error?.retryable===false
  );
  await fs.rm(f.dir,{recursive:true,force:true});
});
