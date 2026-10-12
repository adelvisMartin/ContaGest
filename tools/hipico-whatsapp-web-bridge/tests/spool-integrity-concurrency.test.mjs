import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBridgeSpoolRuntime } from '../src/spool-runtime.mjs';
import { createSpoolRecord, validateSpoolRecord } from '../src/spool-journal.mjs';

async function fixture() {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-spool-hardening-'));
  const runtime=createBridgeSpoolRuntime({rootDir:path.join(dir,'spool-v2'),parserVersion:'bridge-v1'});
  await runtime.initialize();
  return{dir,runtime,root:path.join(dir,'spool-v2'),cleanup:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('concurrent duplicate enqueues have exactly one insertion and no changed payload',async()=>{
  const f=await fixture();
  try{
    const event={channelKey:'source',externalMessageId:'m-atomic',text:'safe shadow input'};
    const results=await Promise.all(Array.from({length:20},()=>f.runtime.queueBackendEvent(event)));
    assert.equal(results.filter(x=>x.duplicate===false).length,1);
    assert.equal(results.filter(x=>x.duplicate===true).length,19);
    const files=await fs.readdir(path.join(f.root,'queued'));
    assert.equal(files.length,1);
    assert.equal((await f.runtime.snapshot()).pendingBackend,1);
    let delivered=0;
    assert.equal((await f.runtime.flushBackend(async()=>{delivered+=1;})).delivered,1);
    assert.equal(delivered,1);
    assert.equal((await f.runtime.snapshot()).pendingBackend,0);
  }finally{await f.cleanup();}
});

test('a concurrent same-ID payload mismatch never overwrites the first persisted event',async()=>{
  const f=await fixture();
  try{
    const base={channelKey:'source',externalMessageId:'m-conflict'};
    const results=await Promise.allSettled([
      f.runtime.queueBackendEvent({...base,text:'first'}),
      f.runtime.queueBackendEvent({...base,text:'second'})
    ]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const rejected=results.find(x=>x.status==='rejected');
    assert.equal(rejected?.reason?.code,'SPOOL_REPLAY_MISMATCH');
    assert.equal(rejected?.reason?.retryable,false);
    const files=await fs.readdir(path.join(f.root,'queued'));
    assert.equal(files.length,1);
  }finally{await f.cleanup();}
});

test('concurrent flushes of same kind cannot invoke the LAB sender twice',async()=>{
  const f=await fixture();
  try{
    await f.runtime.queueLabMirror({sourceExternalMessageId:'m-lab',text:'LAB only',labGroupName:'private-test'});
    let unblock;
    const hold=new Promise(resolve=>{unblock=resolve;});
    let began;
    const started=new Promise(resolve=>{began=resolve;});
    let deliveries=0;
    const first=f.runtime.flushLab(async()=>{deliveries+=1;began();await hold;});
    await started;
    const second=await f.runtime.flushLab(async()=>{deliveries+=1;});
    assert.equal(second.attempted,0);
    assert.equal(second.busy,true);
    unblock();
    assert.equal((await first).delivered,1);
    assert.equal(deliveries,1);
    assert.equal((await f.runtime.snapshot()).byKind['lab-mirror'].sent,1);
  }finally{await f.cleanup();}
});

test('invalid digest/path-like record IDs never become deliverable or write outside spool',async()=>{
  const f=await fixture();
  try{
    const original=createSpoolRecord({kind:'backend-event',key:'source|bad-file',payload:{text:'do-not-send'},parserVersion:'bridge-v1'});
    const forged={...original,recordId:'../../outside-spool'};
    assert.ok(validateSpoolRecord(forged).errors.includes('RECORD_ID_MISMATCH'));
    await fs.writeFile(path.join(f.root,'queued',original.recordId+'.json'),JSON.stringify(forged));
    let delivered=0;
    const result=await f.runtime.flushBackend(async()=>{delivered+=1;});
    assert.equal(result.delivered,0);
    assert.equal(delivered,0);
    assert.equal((await f.runtime.snapshot()).quarantined,1);
    const files=await fs.readdir(path.join(f.root,'quarantined'));
    assert.equal(files.length,1);
    const quarantined=JSON.parse(await fs.readFile(path.join(f.root,'quarantined',files[0]),'utf8'));
    assert.match(quarantined.recordId,/^[a-f0-9]{64}$/);
    assert.equal(quarantined.state,'quarantined');
    assert.equal(quarantined.payload.quarantinedOriginal.recordId,forged.recordId);
  }finally{await f.cleanup();}
});

test('mismatched state directory and record file name are quarantined, not delivered',async()=>{
  const f=await fixture();
  try{
    const record=createSpoolRecord({kind:'backend-event',key:'source|wrongstate',payload:{text:'blocked'},parserVersion:'bridge-v1'});
    await fs.writeFile(path.join(f.root,'failed',record.recordId+'.json'),JSON.stringify(record));
    const another=createSpoolRecord({kind:'backend-event',key:'source|wrongfilename',payload:{text:'blocked'},parserVersion:'bridge-v1'});
    await fs.writeFile(path.join(f.root,'queued','not-a-hash.json'),JSON.stringify(another));
    let delivered=0;
    assert.equal((await f.runtime.flushBackend(async()=>{delivered++;})).delivered,0);
    assert.equal(delivered,0);
    assert.equal((await f.runtime.snapshot()).quarantined,2);
  }finally{await f.cleanup();}
});

test('corrupt existing same-ID file blocks overwriting instead of losing recovery evidence',async()=>{
  const f=await fixture();
  try{
    const event={channelKey:'source',externalMessageId:'m-corrupt',text:'original'};
    const record=createSpoolRecord({kind:'backend-event',key:'source|m-corrupt',payload:event,parserVersion:'bridge-v1'});
    const target=path.join(f.root,'queued',record.recordId+'.json');
    await fs.writeFile(target,'{"malformed":');
    await assert.rejects(()=>f.runtime.queueBackendEvent(event),/SPOOL_EXISTING_RECORD_INVALID/);
    assert.equal(await fs.readFile(target,'utf8'),'{"malformed":');
  }finally{await f.cleanup();}
});
