import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLabPendingQueryInbox, reconcileLabPendingObservation } from '../src/lab-pending-query-inbox.mjs';

const LAB='120363222222222222@g.us';
const SOURCE='120363111111111111@g.us';
const SENDER='123456789012@lid';
const MESSAGE='false_120363222222222222@g.us_m-1_'+SENDER;
const TEXT='¿Cuál es el resultado de la carrera 5 en hipódromo La Rinconada el 2026-10-12?';
const candidate=(extra={})=>({
  messageId:MESSAGE,senderId:SENDER,text:TEXT,purpose:'result',
  messageTimestamp:new Date(500000).toISOString(),
  race:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'},
  quotedMessageId:null,...extra
});
async function harness(t){
  const rootDir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-lab-pending-'));
  t.after(()=>fs.rm(rootDir,{recursive:true,force:true}));
  let now=500000;
  return{rootDir,now:()=>now,advance:ms=>{now+=ms},
    create:(group=LAB)=>createLabPendingQueryInbox({
      rootDir,labGroupId:group,sourceGroupId:SOURCE,now:()=>now
    })};
}
test('encrypted pre-query LAB inbox survives restart without storing sender or text in clear',async t=>{
  const f=await harness(t);
  const first=f.create();await first.initialize();
  assert.deepEqual(await first.enqueue(candidate()),{created:true});
  assert.deepEqual(await first.enqueue(candidate()),{created:false});
  assert.equal((await first.snapshot()).pending,1);
  const names=await fs.readdir(f.rootDir);
  const row=names.find(name=>name.endsWith('.json'));
  assert.match(row,/^[0-9a-f]{64}\.json$/);
  const raw=await fs.readFile(path.join(f.rootDir,row),'utf8');
  assert.equal(raw.includes(TEXT),false);
  assert.equal(raw.includes(SENDER),false);
  assert.equal(raw.includes(MESSAGE),false);
  assert.equal(raw.includes(LAB),false);
  const key=await fs.readFile(path.join(f.rootDir,'inbox.key'));
  assert.equal(key.length,32);
  assert.equal(await first.close(),undefined);
  const next=f.create();await next.initialize();
  const restored=await next.list();
  assert.equal(restored.length,1);
  assert.deepEqual({...restored[0],capturedAt:0},{...candidate(),capturedAt:0});
  assert.equal(await next.remove(MESSAGE),true);
  assert.equal((await next.snapshot()).pending,0);
  await next.close();
});
test('single-owner lock rejects two concurrent Windows Bridge writers without overwriting state',async t=>{
  const f=await harness(t);
  const first=f.create();await first.initialize();
  const second=f.create();
  await assert.rejects(second.initialize(),/LAB_PENDING_ALREADY_RUNNING/);
  await first.close();
  const third=f.create();
  await third.initialize();await third.close();
});
test('immutable message identity rejects text or quoted-race mutation and financial requests',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await inbox.enqueue(candidate());
  await assert.rejects(inbox.enqueue(candidate({text:TEXT+' otra información'})),/LAB_PENDING_REPLAY_MISMATCH/);
  await assert.rejects(inbox.enqueue(candidate({race:{raceNumber:6,racetrack:'La Rinconada',raceDate:'2026-10-12'}})),/LAB_PENDING_REPLAY_MISMATCH/);
  await assert.rejects(inbox.enqueue(candidate({text:'Juega 20 al caballo 5',purpose:'result'})),/LAB_PENDING_QUERY_INVALID/);
  await assert.rejects(inbox.enqueue(candidate({senderId:'999999999999@lid'})),/LAB_PENDING_QUERY_INVALID/);
  await assert.rejects(inbox.enqueue(candidate({quotedMessageId:'prior-claim',race:null})),/LAB_PENDING_QUERY_INVALID/);
  await inbox.close();
});
test('expired queries are discarded even while backend is down; no stale reply can be recovered',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await inbox.enqueue(candidate());
  f.advance(10*60*1000);
  assert.equal(await inbox.prune(),1);
  assert.deepEqual(await inbox.list(),[]);
  assert.equal((await inbox.snapshot()).pending,0);
  await inbox.close();
});
test('tampered ciphertext cannot become a candidate; fail closed at startup',async t=>{
  const f=await harness(t);const first=f.create();await first.initialize();
  await first.enqueue(candidate());
  await first.close();
  const row=(await fs.readdir(f.rootDir)).find(name=>name.endsWith('.json'));
  const file=path.join(f.rootDir,row);
  const encoded=JSON.parse(await fs.readFile(file,'utf8'));
  encoded.ciphertext=crypto.randomBytes(50).toString('base64');
  await fs.writeFile(file,JSON.stringify(encoded));
  const next=f.create();
  await assert.rejects(next.initialize(),/LAB_PENDING_RECORD_INVALID/);
});
test('Bridge persists encrypted request before HTTP read and uses only verified canonical LAB data on recovery',async()=>{
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const process=src.slice(src.indexOf('async function processLabTestInput()'),src.indexOf('async function visibleLabHasTag'));
  const queue=process.indexOf('await labPendingInbox.enqueue(');
  const canonical=process.indexOf('await queryCanonicalLab({');
  const send=process.indexOf('await sendTextInCurrentLab(');
  const ack=process.indexOf('await labTestReplyJournal.confirm(');
  assert.ok(queue>=0&&queue<canonical&&canonical<send&&send<ack);
  assert.match(process,/await resumePendingLabQueries\(/);
  const recovery=src.slice(src.indexOf('async function resumePendingLabQueries('),src.indexOf('async function processLabTestInput()'));
  assert.match(recovery,/await labTestReplyJournal\.read\(entry.messageId\)/);
  assert.match(recovery,/state\?\.state === 'sending' \|\| state\?\.state === 'ambiguous'/);
  assert.match(recovery,/canonical\.available!==true/);
  assert.match(recovery,/await assertCurrentLabIdentity\(\)/);
  assert.match(recovery,/await labPendingInbox\.remove\(entry.messageId\)/);
  assert.match(src,/SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
});

test('re-capturing an old message cannot renew the original timestamp after TTL',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await inbox.enqueue(candidate());
  f.advance(10*60*1000+1000);
  assert.equal(await inbox.prune(),1);
  await assert.rejects(inbox.enqueue(candidate()),/LAB_PENDING_QUERY_INVALID/);
  assert.equal((await inbox.snapshot()).pending,0);
  await inbox.close();
});

test('changing pinned LAB group cannot decrypt pending questions or silently migrate them',async t=>{
  const f=await harness(t);
  const original=f.create();await original.initialize();await original.enqueue(candidate());
  await original.close();
  const other=f.create('120363333333333333@g.us');
  await assert.rejects(other.initialize(),/LAB_PENDING_RECORD_INVALID/);
  const restored=f.create();await restored.initialize();
  assert.equal((await restored.list()).length,1);
  await restored.close();
});

test('unknown original message time cannot be used to extend pending query lifetime',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await assert.rejects(inbox.enqueue(candidate({messageTimestamp:'unknown'})),/LAB_PENDING_QUERY_INVALID/);
  await assert.rejects(inbox.enqueue(candidate({messageTimestamp:new Date(f.now()+65000).toISOString()})),/LAB_PENDING_QUERY_INVALID/);
  await inbox.close();
});

test('non-quoted race scope must have appeared explicitly in that very question',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await assert.rejects(inbox.enqueue(candidate({text:'¿Cuál es el resultado?',quotedMessageId:null})),/LAB_PENDING_QUERY_INVALID/);
  const quote=candidate({text:'¿Cuál es el resultado?',quotedMessageId:'prior-verified-from-same-sender'});
  assert.equal((await inbox.enqueue(quote)).created,true);
  await inbox.close();
});


test('an originally verified quote survives loss of its prior visible DOM message',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  const original=candidate({
    text:'¿Cuál es el resultado?',
    quotedMessageId:'verified-prior-message-id'
  });
  await inbox.enqueue(original);
  const stored=await inbox.read(MESSAGE);
  assert.ok(stored);
  const recovered=reconcileLabPendingObservation(stored,{
    messageId:MESSAGE,senderId:SENDER,text:'¿Cuál es el resultado?',
    purpose:'result',messageTimestamp:original.messageTimestamp,
    quotedMessageId:null,explicitRace:null
  });
  assert.equal(recovered.valid,true);
  assert.equal(recovered.quotedMessageId,'verified-prior-message-id');
  assert.deepEqual(recovered.race,original.race);
  await inbox.close();
});

test('ID reuse, changed quote, sender, timestamp or race never override encrypted scope',()=>{
  const stored=candidate({quotedMessageId:'original-quoted-id'});
  const base={
    messageId:stored.messageId,senderId:stored.senderId,text:stored.text,
    purpose:stored.purpose,messageTimestamp:stored.messageTimestamp,
    quotedMessageId:stored.quotedMessageId,explicitRace:stored.race
  };
  assert.equal(reconcileLabPendingObservation(stored,base).valid,true);
  for(const changed of [
    {messageId:'other-message-id'},{senderId:'99999999999@lid'},
    {text:stored.text+' cambiado'},{purpose:'status'},
    {messageTimestamp:new Date(501000).toISOString()},
    {quotedMessageId:'spoofed-quoted-id'},
    {explicitRace:{raceNumber:6,racetrack:'La Rinconada',raceDate:'2026-10-12'}}
  ])assert.equal(reconcileLabPendingObservation(stored,{...base,...changed}).valid,false);
});

test('live LAB read uses immutable restored scope rather than disappearing visible quote',async()=>{
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const live=src.slice(src.indexOf('async function processLabTestInput()'),src.indexOf('async function visibleLabHasTag'));
  const read=live.indexOf('await labPendingInbox.read(row.id)');
  const reconcile=live.indexOf('reconcileLabPendingObservation(original');
  const lookup=live.indexOf('await queryCanonicalLab({');
  assert.ok(read>=0&&reconcile>read&&lookup>reconcile);
  assert.match(live,/trustedRace=verified\.race/);
  assert.match(live,/trustedQuote=verified\.quotedMessageId/);
  assert.match(live,/LAB_PENDING_REVIEW_REQUIRED id=/);
});


test('direct lookup expires only its matching encrypted record and preserves other pending queries',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await inbox.enqueue(candidate());
  const second=candidate({messageId:'false_120363222222222222@g.us_msg-two_'+SENDER});
  await inbox.enqueue(second);
  assert.equal((await inbox.read(MESSAGE))?.messageId,MESSAGE);
  assert.equal((await inbox.read('false_120363222222222222@g.us_does-not-exist_'+SENDER)),null);
  f.advance(10*60*1000);
  assert.equal(await inbox.read(MESSAGE),null);
  assert.equal(await inbox.read(second.messageId),null);
  assert.equal((await inbox.snapshot()).pending,0);
  await inbox.close();
});


test('next, active and schedule canonical read intents are durably recoverable without a fabricated race',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();
  const topics=[
    ['next','¿Qué carrera sigue?'],
    ['active','¿Cuál es la carrera activa?'],
    ['schedule','¿Cuál es la cartelera?']
  ];
  for(let index=0;index<topics.length;index++){
    const [purpose,text]=topics[index];
    const messageId='false_120363222222222222@g.us_info-'+index+'_'+SENDER;
    const result=await inbox.enqueue(candidate({
      messageId,text,purpose,race:null,quotedMessageId:null
    }));
    assert.equal(result.created,true);
    assert.equal((await inbox.read(messageId))?.purpose,purpose);
  }
  assert.equal((await inbox.snapshot()).pending,3);
  await inbox.close();
});
