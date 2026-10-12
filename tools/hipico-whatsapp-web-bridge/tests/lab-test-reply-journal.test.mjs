import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createLabTestReplyJournal,labTestTagForMessage} from '../src/lab-test-reply-journal.mjs';

const LAB_ID='120363222222222222@g.us';
const OTHER_LAB='120363333333333333@g.us';
const SOURCE_ID='120363111111111111@g.us';

async function fixture(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-lab-ack-'));
  const rootDir=path.join(dir,'ack');
  const make=(labGroupId=LAB_ID)=>createLabTestReplyJournal({
    rootDir,labGroupId,sourceGroupId:SOURCE_ID,
    now:()=>Date.UTC(2026,9,12,6,0,0)
  });
  return{dir,rootDir,make,journal:make(),clean:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('durably prepares a private, scoped, redacted record before any send',async()=>{
  const f=await fixture();
  try{
    const id='external-id:phone-123456789|private-message';
    const one=await f.journal.prepare(id);
    assert.equal(one.created,true);
    assert.equal(one.record.state,'prepared');
    const again=await f.journal.prepare(id);
    assert.equal(again.created,false);
    assert.equal(again.record.idHash,one.record.idHash);
    assert.equal(labTestTagForMessage(id),one.record.tag);
    const files=await fs.readdir(f.rootDir);
    assert.deepEqual(files,[one.record.idHash+'.json']);
    const bytes=await fs.readFile(path.join(f.rootDir,files[0]),'utf8');
    assert.doesNotMatch(bytes,/123456789|private-message|@g\.us|Bearer/);
    assert.match(one.record.idHash,/^[a-f0-9]{64}$/);
    if(process.platform!=='win32'){
      assert.equal((await fs.stat(f.rootDir)).mode&0o777,0o700);
      assert.equal((await fs.stat(path.join(f.rootDir,files[0]))).mode&0o777,0o600);
    }
  }finally{await f.clean();}
});

test('confirmed LAB acknowledgment survives a new process instance without seen-file',async()=>{
  const f=await fixture();
  try{
    const id='lab-message-ack-1';
    await f.journal.prepare(id);
    assert.equal((await f.journal.begin(id)).state,'sending');
    await assert.rejects(()=>f.journal.confirm(id),/LAB_TEST_VISIBLE_TAG_REQUIRED/);
    assert.equal((await f.journal.confirm(id,{visibleTag:true})).state,'confirmed');
    assert.equal((await f.make().initialize()).recovered,0);
    assert.equal((await f.make().read(id)).state,'confirmed');
    assert.equal((await f.make().confirm(id,{visibleTag:true})).state,'confirmed');
    assert.deepEqual((await f.make().snapshot()).counts,{prepared:0,sending:0,confirmed:1,ambiguous:0});
  }finally{await f.clean();}
});

test('crash after sending intent recovers to ambiguity and cannot auto-reset to prepared',async()=>{
  const f=await fixture();
  try{
    const id='lab-message-interrupted-1';
    await f.journal.prepare(id);
    await f.journal.begin(id);
    const restarted=f.make();
    assert.equal((await restarted.initialize()).recovered,1);
    assert.equal((await restarted.initialize()).recovered,0);
    assert.equal((await restarted.read(id)).state,'ambiguous');
    assert.equal((await restarted.snapshot()).ambiguous,1);
    await assert.rejects(()=>restarted.begin(id),/LAB_TEST_JOURNAL_STATE_CONFLICT/);
    await assert.rejects(()=>restarted.retryPrepared(id),/LAB_TEST_JOURNAL_STATE_CONFLICT/);
    await assert.rejects(()=>restarted.confirm(id),/LAB_TEST_VISIBLE_TAG_REQUIRED/);
    assert.equal((await restarted.confirm(id,{visibleTag:true})).state,'confirmed');
    assert.equal((await restarted.snapshot()).ambiguous,0);
  }finally{await f.clean();}
});

test('verified failure before Enter can retry after restart without duplicate confirmation',async()=>{
  const f=await fixture();
  try{
    const id='lab-retry-safe';
    await f.journal.prepare(id);
    await f.journal.begin(id);
    assert.equal((await f.journal.retryPrepared(id)).state,'prepared');
    const restarted=f.make();
    assert.equal((await restarted.initialize()).recovered,0);
    assert.equal((await restarted.read(id)).state,'prepared');
    assert.equal((await restarted.begin(id)).attempts,2);
    assert.equal((await restarted.markAmbiguous(id)).state,'ambiguous');
    assert.equal((await restarted.markAmbiguous(id)).state,'ambiguous');
    await assert.rejects(()=>restarted.prepare(id).then(()=>restarted.begin(id)),/LAB_TEST_JOURNAL_STATE_CONFLICT/);
  }finally{await f.clean();}
});

test('journal cannot be reused across LAB groups or pointed to SOURCE',async()=>{
  const f=await fixture();
  try{
    await f.journal.prepare('lab-scope-key');
    await assert.rejects(()=>f.make(OTHER_LAB).read('lab-scope-key'),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    await assert.rejects(()=>f.make(OTHER_LAB).initialize(),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    assert.throws(()=>f.make(SOURCE_ID),/LAB_TEST_JOURNAL_PINNED_LAB_REQUIRED/);
    assert.throws(()=>f.make('not-a-group'),/LAB_TEST_JOURNAL_PINNED_LAB_REQUIRED/);
  }finally{await f.clean();}
});

test('corrupt or tampered persistent ACK fails closed and is never silently overwritten',async()=>{
  const f=await fixture();
  try{
    const id='lab-corrupt';
    const prepared=await f.journal.prepare(id);
    const file=path.join(f.rootDir,prepared.record.idHash+'.json');
    const bad=JSON.stringify({...prepared.record,state:'confirmed',scopeHash:'f'.repeat(64)});
    await fs.writeFile(file,bad);
    await assert.rejects(()=>f.journal.read(id),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    await assert.rejects(()=>f.journal.prepare(id),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    await assert.rejects(()=>f.make().initialize(),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    assert.equal(await fs.readFile(file,'utf8'),bad);
  }finally{await f.clean();}
});

test('invalid IDs and non-canonical journal file names fail closed',async()=>{
  const f=await fixture();
  try{
    await assert.rejects(()=>f.journal.prepare(''),/LAB_TEST_MESSAGE_ID_INVALID/);
    await assert.rejects(()=>f.journal.prepare('x'.repeat(2049)),/LAB_TEST_MESSAGE_ID_INVALID/);
    await f.journal.initialize();
    await fs.writeFile(path.join(f.rootDir,'unreviewed.json'),'{}');
    await assert.rejects(()=>f.make().initialize(),/LAB_TEST_JOURNAL_FILE_INVALID/);
  }finally{await f.clean();}
});

test('live Bridge only acknowledges after durable confirmation and reconciles outbound tag',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const code=await fs.readFile(path.join(root,'src','index.mjs'),'utf8');
  const start=code.indexOf('async function processLabTestInput()');
  const end=code.indexOf('async function visibleLabHasTag',start);
  assert.ok(start>=0&&end>start);
  const block=code.slice(start,end);
  const prepared=block.indexOf('await labTestReplyJournal.prepare(row.id)');
  const beginning=block.indexOf('await labTestReplyJournal.begin(row.id)');
  const send=block.indexOf('await sendTextInCurrentLab(');
  const confirmation=block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  const ack=block.indexOf('rememberLabSeen(row.id); // confirmed delivery/tag');
  assert.ok(prepared>=0&&beginning>prepared&&send>beginning&&confirmation>send&&ack>confirmation);
  assert.match(block,/journalRecord\?\.state === 'confirmed'/);
  assert.match(block,/journalRecord\?\.state === 'ambiguous'/);
  assert.match(block,/await visibleLabHasTag\(tag\)/);
  assert.match(block,/if \(outcome === 'RETRY'\)/);
  assert.match(block,/if \(outcome === 'AMBIGUOUS'\)/);
  assert.match(code,/querySelectorAll\('\.message-out'\)/);
  assert.doesNotMatch(code,/querySelectorAll\('\.message-out, \[data-id\]'\)/);
  assert.match(code,/LAB_TEST_RECOVERED_AMBIGUOUS/);
  assert.match(code,/labTestReplyStates: labAck\?\.counts/);
  assert.match(code,/await atomicWriteJson\(LAB_SEEN_FILE,values\)/);
});
