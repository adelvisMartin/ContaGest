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
  await assert.rejects(inbox.enqueue(candidate({race:{raceNumber:6,racetrack:'La Rinconada',raceDate:'2026-10-12'}})),/LAB_PENDING_QUERY_INVALID/);
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
  const prepare=process.indexOf('await labTestReplyJournal.prepare(row.id)');
  const ack=process.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  assert.ok(queue>=0&&queue<canonical&&canonical<prepare&&prepare<send&&send<ack);
  assert.match(process,/await resumePendingLabQueries\(/);
  const recovery=src.slice(src.indexOf('async function resumePendingLabQueries('),src.indexOf('async function processLabTestInput()'));
  assert.match(recovery,/await labTestReplyJournal\.read\(entry.messageId\)/);
  assert.match(recovery,/state\?\.state === 'sending' \|\| state\?\.state === 'ambiguous'/);
  assert.match(recovery,/canonical\.available!==true/);
  assert.match(recovery,/await assertCurrentLabIdentity\(\)/);
  assert.match(recovery,/await labPendingInbox\.remove\(entry.messageId\)/);
  const recoveredQuery=recovery.indexOf('await queryCanonicalLab({');
  const recoveredPrepare=recovery.indexOf('await labTestReplyJournal.prepare(entry.messageId)');
  const recoveredSend=recovery.indexOf('await sendTextInCurrentLab(');
  const recoveredAck=recovery.indexOf('await labTestReplyJournal.confirm(entry.messageId,{visibleTag:true});',recoveredSend);
  assert.ok(recoveredQuery>=0&&recoveredQuery<recoveredPrepare&&recoveredPrepare<recoveredSend&&recoveredSend<recoveredAck);
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
  const quote=candidate({text:'¿Cuál es el resultado?',quotedMessageId:'false_120363222222222222@g.us_quoted-from-same-sender_'+SENDER});
  assert.equal((await inbox.enqueue(quote)).created,true);
  await inbox.close();
});


test('an originally verified quote survives loss of its prior visible DOM message',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  const original=candidate({
    text:'¿Cuál es el resultado?',
    quotedMessageId:'false_120363222222222222@g.us_prior-visible_'+SENDER
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
  assert.equal(recovered.quotedMessageId,'false_120363222222222222@g.us_prior-visible_'+SENDER);
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

test('pinned LAB group and stable quote JID reject forged cross-group recovery',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  await assert.rejects(inbox.enqueue(candidate({
    messageId:'false_120363999999999999@g.us_foreign_'+SENDER
  })),/LAB_PENDING_QUERY_INVALID/);
  await assert.rejects(inbox.enqueue(candidate({
    text:'¿Cuál es el resultado?',
    quotedMessageId:'false_120363999999999999@g.us_quoted_'+SENDER
  })),/LAB_PENDING_QUERY_INVALID/);
  await assert.rejects(inbox.enqueue(candidate({
    text:'¿Cuál es el resultado?',
    quotedMessageId:'false_120363222222222222@g.us_quoted_999999999999@lid'
  })),/LAB_PENDING_QUERY_INVALID/);
  await inbox.close();
});


test('foreign-host lock never reclaimed merely because its PID is absent on this Windows host',async t=>{
  const f=await harness(t);
  const owner=f.create();await owner.initialize();
  const file=path.join(f.rootDir,'owner.lock');
  const original=JSON.parse(await fs.readFile(file,'utf8'));
  const foreign={...original,hostHash:original.hostHash==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64),pid:2147483647};
  await fs.writeFile(file,JSON.stringify(foreign));
  const secondary=f.create();
  await assert.rejects(secondary.initialize(),/LAB_PENDING_REMOTE_OWNER/);
  await fs.writeFile(file,JSON.stringify(original));
  await owner.close();
});

test('same-host stale PID lock is reclaimed only with matching scope and host identity',async t=>{
  const f=await harness(t);
  const owner=f.create();await owner.initialize();
  const file=path.join(f.rootDir,'owner.lock');
  const old=JSON.parse(await fs.readFile(file,'utf8'));
  await owner.close();
  await fs.writeFile(file,JSON.stringify({...old,pid:2147483647}));
  const recovered=f.create();
  await recovered.initialize();
  assert.equal((await recovered.snapshot()).pending,0);
  await recovered.close();
});


test('confirmed LAB ACK, including restart and ambiguous reconciliation, backfills verified quote before inbox deletion',async()=>{
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const helper=source.slice(source.indexOf('async function rememberConfirmedPendingLabQuote('),
    source.indexOf('async function resumePendingLabQueries('));
  assert.match(helper,/labQuotedRaceJournal\.remember\(\{/);
  assert.match(helper,/confirmed:true/);
  assert.match(helper,/sender!==entry\.senderId/);
  assert.match(helper,/explicitLabRaceScope\(entry\.text\)/);
  assert.match(helper,/return false;/); // Hint failure retains encrypted pending data.

  const recovery=source.slice(source.indexOf('async function resumePendingLabQueries('),
    source.indexOf('async function processLabTestInput()'));
  const confirmed=recovery.slice(recovery.indexOf("if (state?.state === 'confirmed')"),
    recovery.indexOf("if (state?.state === 'sending'"));
  assert.ok(confirmed.indexOf('await saveLabSeenNow()') <
    confirmed.indexOf('await rememberConfirmedPendingLabQuote(entry)'));
  assert.ok(confirmed.indexOf('await rememberConfirmedPendingLabQuote(entry)') <
    confirmed.indexOf('await labPendingInbox.remove(entry.messageId)'));
  assert.doesNotMatch(confirmed,/sendTextInCurrentLab/);

  const ambiguous=recovery.slice(recovery.indexOf("if (state?.state === 'sending'"),
    recovery.indexOf('const row = {'));
  assert.ok(ambiguous.indexOf('await labTestReplyJournal.confirm(entry.messageId') <
    ambiguous.indexOf('await rememberConfirmedPendingLabQuote(entry)'));
  assert.ok(ambiguous.indexOf('await rememberConfirmedPendingLabQuote(entry)') <
    ambiguous.indexOf('await labPendingInbox.remove(entry.messageId)'));
  assert.doesNotMatch(ambiguous,/sendTextInCurrentLab/);

  const afterSend=recovery.slice(recovery.indexOf('await sendTextInCurrentLab('));
  assert.ok(afterSend.indexOf('await labTestReplyJournal.confirm(entry.messageId') <
    afterSend.indexOf('await rememberConfirmedPendingLabQuote(entry)'));
  assert.ok(afterSend.indexOf('await rememberConfirmedPendingLabQuote(entry)') <
    afterSend.indexOf('await labPendingInbox.remove(entry.messageId)'));
});


test('mixed SOURCE/LAB message identifiers and quotes never enter the encrypted inbox',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();
  // A raw substring check for LAB could otherwise accept both group JIDs.
  const mixedId='false_120363111111111111@g.us_120363222222222222@g.us_mix_'+SENDER;
  await assert.rejects(inbox.enqueue(candidate({messageId:mixedId})),/LAB_PENDING_QUERY_INVALID/);
  const quote='false_120363111111111111@g.us_120363222222222222@g.us_quoted_'+SENDER;
  await assert.rejects(inbox.enqueue(candidate({
    text:'¿Cuál es el resultado?',quotedMessageId:quote
  })),/LAB_PENDING_QUERY_INVALID/);
  assert.equal((await inbox.snapshot()).pending,0);
  await inbox.close();
});


test('out-of-DOM LAB reconciliation relies on strict pinned outgoing first-line evidence, never quoted tag substring',async()=>{
  const fs=await import('node:fs/promises');
  const index=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const section=index.slice(index.indexOf('async function resumePendingLabQueries('),index.indexOf('async function processLabTestInput()'));
  assert.match(section,/if \(await visibleLabHasTag\(tag\)\)/);
  const start=index.indexOf('async function visibleLabHasTag(tag) {');
  const stop=index.indexOf('async function sendMirrorToLab(mirror) {',start);
  const proof=index.slice(start,stop);
  assert.ok(start>0&&stop>start);
  assert.match(proof,/const main=document\.querySelector\('#main'\)/);
  assert.match(proof,/main\.querySelectorAll\('\.message-out'\)/);
  assert.equal((proof.match(/await assertCurrentLabIdentity\(\)/g)||[]).length,2);
  assert.match(proof,/labOutgoingEvidenceMatches\(text,tag\)/);
  assert.doesNotMatch(proof,/\.includes\(needle\)/);
  const {labOutgoingEvidenceMatches}=await import('../src/lab-outgoing-evidence.mjs');
  const tag='[LABTEST:012345abcd]';
  const valid=[
    tag,'🧪 CONTROL HÍPICO · PRUEBA LAB',
    'Respuesta: Se requiere confirmación canónica.',
    'Fuente: Lectura LAB'
  ].join('\n');
  assert.equal(labOutgoingEvidenceMatches(valid,tag),true);
  assert.equal(labOutgoingEvidenceMatches('Cita anterior:\n'+valid,tag),false);
  assert.equal(labOutgoingEvidenceMatches(tag+'\nTexto incompleto',tag),false);
});


test('atomic encrypted inbox restart deletes orphan temporary writes, preserves complete records',async t=>{
  const fixture=await harness(t);
  const first=fixture.create();await first.initialize();
  await first.enqueue(candidate());
  const tempName='a'.repeat(64)+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(path.join(fixture.rootDir,tempName),'interrupted encrypted candidate', {mode:0o600});
  await first.close();
  const restored=fixture.create();
  const start=await restored.initialize();
  assert.equal(start.recovered,1);
  assert.equal((await restored.list()).length,1);
  assert.equal((await fs.readdir(fixture.rootDir)).includes(tempName),false);
  await restored.close();
});

test('only completed encrypted LAB records use final .json filenames',async t=>{
  const fixture=await harness(t);const inbox=fixture.create();
  await inbox.initialize();
  await inbox.enqueue(candidate());
  const contents=await fs.readdir(fixture.rootDir);
  assert.equal(contents.filter(name=>name.endsWith('.json')).length,1);
  assert.equal(contents.filter(name=>name.endsWith('.tmp')).length,0);
  assert.match(contents.find(name=>name.endsWith('.json')),/^[a-f0-9]{64}\.json$/);
  await inbox.close();
});
