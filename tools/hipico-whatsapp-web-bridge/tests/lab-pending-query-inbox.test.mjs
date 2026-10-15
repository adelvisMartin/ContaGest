import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLabPendingQueryInbox, reconcileLabPendingObservation } from '../src/lab-pending-query-inbox.mjs';
import {queryCanonicalLab} from '../src/lab-canonical-query.mjs';

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
test('verified quoted race rejects invalid calendar day and accepts leap day',async t=>{
  const f=await harness(t);const inbox=f.create();await inbox.initialize();
  const quote='false_120363222222222222@g.us_prior_'+SENDER;
  for(const raceDate of ['2026-02-31','2026-02-29','2026-13-01','2026-04-31']){
    await assert.rejects(inbox.enqueue(candidate({
      text:'¿Cuál es el resultado?',quotedMessageId:quote,
      race:{raceNumber:5,racetrack:'La Rinconada',raceDate}
    })),/LAB_PENDING_QUERY_INVALID/);
  }
  const valid=candidate({text:'¿Cuál es el resultado?',quotedMessageId:quote,
    race:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2028-02-29'}});
  assert.deepEqual(await inbox.enqueue(valid),{created:true});
  assert.equal((await inbox.read(MESSAGE))?.race.raceDate,'2028-02-29');
  await inbox.close();
});



test('scan expiry predicate cannot be shadowed by expired-count accumulator',async t=>{
  const source=await fs.readFile(new URL('../src/lab-pending-query-inbox.mjs',import.meta.url),'utf8');
  const begin=source.indexOf('  async function scan(){');
  const end=source.indexOf('  return Object.freeze({',begin);
  assert.ok(begin>=0&&end>begin,'canonical inbox scan source missing');
  const section=source.slice(begin,end);
  const checks=await import('node:vm');
  const cases=[
    {age:100_000,expired:0,recovered:1},
    {age:600_000,expired:1,recovered:0}
  ];
  for(const c of cases){
    let removals=0;
    const hash='a'.repeat(64);
    const now=700_000;
    const entry={
      messageTimestamp:new Date(now-c.age).toISOString(),
      capturedAt:now-c.age
    };
    const env={
      fs:{readdir:async()=>[hash+'.json'],rm:async()=>{removals++;}},
      root:'/inbox',
      openFile:async()=>entry,
      fileFor:()=>'/inbox/'+hash+'.json',
      expired:item=>now-Date.parse(item.messageTimestamp)>=600_000||
        now-item.capturedAt>=600_000,
      maxEntries:200
    };
    const scan=checks.runInNewContext('(()=>{'+section+'return scan;})()',env);
    const out=await scan();
    assert.equal(out.expired,c.expired);
    assert.equal(out.rows.length,c.recovered);
    assert.equal(removals,c.expired);
  }
});


test('health near-expiry uses the earliest bounded LAB ciphertext deadline',async t=>{
  const h=await harness(t);
  const inbox=h.create();await inbox.initialize();
  const future=candidate({
    messageTimestamp:new Date(h.now()+60_000).toISOString()
  });
  await inbox.enqueue(future);
  h.advance(8*60*1000);
  const warning=await inbox.snapshot();
  assert.equal(warning.pending,1);
  assert.equal(warning.nearingExpiry,1,
    '8-minute capture age reaches warning threshold despite 7-minute remote timestamp age');
  assert.equal(warning.oldestAgeSeconds,480,
    'operator diagnostic must reflect earliest expiry time');
  h.advance(2*60*1000);
  const expired=await inbox.snapshot();
  assert.equal(expired.pending,0);
  assert.equal(expired.nearingExpiry,0);
  assert.equal(expired.oldestAgeSeconds,0);
  await inbox.close();
});

test('future-dated LAB message expires at capture TTL even before WhatsApp timestamp TTL',async t=>{
  const h=await harness(t);
  const inbox=h.create();await inbox.initialize();
  const original=candidate({
    messageTimestamp:new Date(h.now()+60_000).toISOString()
  });
  assert.deepEqual(await inbox.enqueue(original),{created:true});
  h.advance(10*60*1000-1);
  assert.equal((await inbox.read(original.messageId))?.messageId,original.messageId);
  assert.equal((await inbox.snapshot()).pending,1);
  h.advance(1); // 10 min since local capture, only 9 min since client timestamp.
  assert.equal(await inbox.read(original.messageId),null,
    'direct lookups cannot extend TTL using a client clock in the future');
  assert.deepEqual(await inbox.list(),[]);
  assert.equal((await inbox.snapshot()).pending,0);
  const files=await fs.readdir(h.rootDir);
  assert.equal(files.some(name=>/^[a-f0-9]{64}\.json$/.test(name)),false,
    'expired ciphertext must be physically removed');
  await inbox.close();
});

test('restart pruning uses local capturedAt when the source message clock is ahead',async t=>{
  const h=await harness(t);
  const first=h.create();await first.initialize();
  const message=candidate({
    messageTimestamp:new Date(h.now()+60_000).toISOString()
  });
  await first.enqueue(message);
  await first.close();
  h.advance(10*60*1000); // captured clock expired; message timestamp has not.
  const second=h.create();
  assert.deepEqual(await second.initialize(),{recovered:0});
  assert.equal((await second.snapshot()).pending,0);
  assert.equal(await second.read(message.messageId),null);
  await second.close();
});

test('message age remains authoritative when it expires before local capture TTL',async t=>{
  const h=await harness(t);
  const inbox=h.create();await inbox.initialize();
  const timestamp=new Date(h.now()-30_000).toISOString();
  const message=candidate({messageTimestamp:timestamp});
  await inbox.enqueue(message);
  h.advance(10*60*1000-30_000);
  assert.equal((await inbox.snapshot()).pending,0);
  assert.equal(await inbox.read(message.messageId),null);
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

test('self-contained race in a WhatsApp reply never binds an unused quoted message during inbox replay',async t=>{
  const f=await harness(t);
  const inbox=f.create();
  await inbox.initialize();
  const savedInput=candidate({quotedMessageId:null});
  await inbox.enqueue(savedInput);
  const original=await inbox.read(MESSAGE);
  const observedReply='false_'+LAB+'_unrelated-reply_'+SENDER;
  const observed={
    messageId:MESSAGE,senderId:SENDER,text:TEXT,purpose:'result',
    messageTimestamp:savedInput.messageTimestamp,
    quotedMessageId:null, // same normalization used by the visible Bridge
    explicitRace:savedInput.race
  };
  assert.equal(reconcileLabPendingObservation(original,observed).valid,true);
  assert.equal(reconcileLabPendingObservation(original,{
    ...observed,quotedMessageId:observedReply
  }).valid,false,'a raw quoted JID is still rejected at the inbox boundary');

  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const live=source.slice(source.indexOf('async function processLabTestInput()'),
    source.indexOf('async function visibleLabHasTag(tag)'));
  const pre=live.indexOf('const directRace=explicitLabRaceScope(body)');
  const captured=live.indexOf('quotedMessageId:trustedQuote',pre);
  const reconciled=live.indexOf('reconcileLabPendingObservation(saved',pre);
  assert.ok(pre>=0&&captured>pre&&reconciled>pre);
  assert.match(live,/quotedMessageId:directRace\?null:\(row\.quotedId\|\|null\)/);
  assert.match(live,/explicitRace:directRace/);
  assert.match(live,/let trustedQuote=quotedVerified\?row\.quotedId:null/);
  assert.equal((await inbox.read(MESSAGE)).quotedMessageId,null);
  await inbox.close();
});

test('quoted-race LAB query preserves exact JID matching instead of treating every reply as irrelevant',()=>{
  const quote='false_'+LAB+'_original-quote_'+SENDER;
  const stored=candidate({
    text:'¿Cuál es el resultado?',quotedMessageId:quote,purpose:'result'
  });
  const base={
    messageId:stored.messageId,senderId:SENDER,text:stored.text,
    purpose:stored.purpose,messageTimestamp:stored.messageTimestamp,
    explicitRace:null,quotedMessageId:quote
  };
  assert.equal(reconcileLabPendingObservation(stored,base).valid,true);
  assert.deepEqual(reconcileLabPendingObservation(stored,{
    ...base,quotedMessageId:'false_'+LAB+'_different-quote_'+SENDER
  }),{valid:false,reason:'LAB_PENDING_QUOTE_CHANGED'});
  assert.equal(reconcileLabPendingObservation(stored,{
    ...base,explicitRace:{...stored.race,raceNumber:6}
  }).valid,false,'the reply cannot override original verified race scope');
});

test('live LAB read uses immutable restored scope rather than disappearing visible quote',async()=>{
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const live=src.slice(src.indexOf('async function processLabTestInput()'),src.indexOf('async function visibleLabHasTag'));
  const read=live.indexOf('await labPendingInbox.read(row.id)');
  const reconcile=live.indexOf('reconcileLabPendingObservation(stored');
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

test('race summary is durably replayable only as a verified informational LAB query',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();
  const full='Hazme un resumen de la carrera 5 en hipódromo La Rinconada el 2026-10-12';
  const scoped=candidate({messageId:'false_'+LAB+'_summary-explicit_'+SENDER,
    text:full,purpose:'summary'});
  assert.deepEqual(await inbox.enqueue(scoped),{created:true});
  const restored=await inbox.read(scoped.messageId);
  assert.equal(restored?.purpose,'summary');
  assert.deepEqual(restored?.race,scoped.race);
  const unscoped=candidate({messageId:'false_'+LAB+'_summary-general_'+SENDER,
    text:'¿Resumen de la carrera 5?',purpose:'summary',race:null});
  assert.deepEqual(await inbox.enqueue(unscoped),{created:true});
  assert.equal((await inbox.read(unscoped.messageId))?.race,null,
    'a summary without complete original scope cannot invent track/date');
  for(const text of [
    'Hazme un resumen de lo que hablamos sobre carrera 5',
    'Resumen de apuestas y saldos de carrera 5',
    'Hazme resumen de carrera 5 y registra mi jugada'
  ]){
    const forged=candidate({messageId:'false_'+LAB+'_summary-unsafe_'+SENDER,
      text,purpose:'summary',race:null});
    await assert.rejects(inbox.enqueue(forged),/LAB_PENDING_QUERY_INVALID/,text);
  }
  await assert.rejects(inbox.enqueue(candidate({
    messageId:'false_'+LAB+'_summary-fake-scope_'+SENDER,
    text:'¿Resumen de la carrera 5?',purpose:'summary',
    race:scoped.race
  })),/LAB_PENDING_QUERY_INVALID/,
    'implicit original race cannot authorize a pinned autonomous read');
  assert.equal((await inbox.snapshot()).pending,2);
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
  assert.match(helper,/confirmedLabQuoteHint\(\{/);
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


test('confirmed visible LAB ACK only clears inbox after private quote persistence succeeds',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const from=source.indexOf('async function finalizeConfirmedVisibleLabQuote(');
  const to=source.indexOf('async function resumePendingLabQueries(',from);
  assert.ok(from>=0&&to>from);
  const helper=source.slice(from,to).trim();
  assert.doesNotMatch(helper,/sendTextInCurrentLab|page\.keyboard\.press/);

  const entry=candidate();
  const actions=[];
  let hintOk=false;
  const fn=vm.runInNewContext('('+helper+')',{
    labPendingInbox:{
      read:async id=>{actions.push('read');assert.equal(id,MESSAGE);return entry;},
      remove:async id=>{actions.push('remove');assert.equal(id,MESSAGE);}
    },
    stableLabSenderKey:()=>SENDER,
    rememberConfirmedPendingLabQuote:async saved=>{
      actions.push('hint');
      assert.equal(saved,entry);
      return hintOk;
    }
  });
  await fn({id:MESSAGE},TEXT);
  assert.deepEqual(actions,['read','hint'],'failed HMAC write retains pending input');
  actions.length=0;
  hintOk=true;
  await fn({id:MESSAGE},TEXT);
  assert.deepEqual(actions,['read','hint','remove'],'durable HMAC hint precedes inbox deletion');
});

test('confirmed LAB ACK never backfills race from mutable DOM without encrypted input',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const from=source.indexOf('async function finalizeConfirmedVisibleLabQuote(');
  const to=source.indexOf('async function resumePendingLabQueries(',from);
  assert.ok(from>=0&&to>from);
  const helper=source.slice(from,to).trim();
  const actions=[];
  let stored=null;
  const fn=vm.runInNewContext('('+helper+')',{
    labPendingInbox:{
      read:async id=>{assert.equal(id,MESSAGE);actions.push('read');return stored;},
      remove:async id=>{assert.equal(id,MESSAGE);actions.push('remove');}
    },
    rememberConfirmedPendingLabQuote:async entry=>{
      actions.push('hint');
      assert.equal(entry,stored,'hint must come from original encrypted input');
      return true;
    },
    log:async reason=>{assert.equal(reason,'LAB_QUOTE_HINT_NO_VERIFIED_INPUT');actions.push('no-verified-input');}
  });
  await fn({id:MESSAGE},'Consulta: carrera 6 en La Rinconada el 2026-10-12');
  assert.deepEqual(actions,['read','no-verified-input'],'unverified DOM can never establish quoted context');
  actions.length=0;
  stored=candidate();
  await fn({id:MESSAGE},'Consulta: carrera 6 en La Rinconada el 2026-10-12');
  assert.deepEqual(actions,['read','hint','remove'],'verified encrypted context wins over changed DOM');
  assert.doesNotMatch(helper,/senderId:sender,text:body/);
});

test('live LAB confirmed, ambiguous and normal send paths share ACK-only quote finalization',async()=>{
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function processLabTestInput()');
  const end=source.indexOf('async function visibleLabHasTag(tag)',start);
  const live=source.slice(start,end);
  const confirmed=live.slice(live.indexOf("if (journalRecord?.state === 'confirmed')"),
    live.indexOf("if (journalRecord?.state === 'ambiguous'"));
  const reconciled=live.slice(live.indexOf("if (journalRecord?.state === 'ambiguous'"),
    live.indexOf('const classification = classifyLocal(body);'));
  const afterSend=live.slice(live.indexOf('await sendTextInCurrentLab('));
  assert.ok(confirmed.includes('await finalizeConfirmedVisibleLabQuote(row,body)'));
  assert.ok(reconciled.indexOf('await labTestReplyJournal.confirm(row.id') <
    reconciled.indexOf('await finalizeConfirmedVisibleLabQuote(row,body)'));
  assert.ok(afterSend.indexOf('await labTestReplyJournal.confirm(row.id') <
    afterSend.indexOf('await finalizeConfirmedVisibleLabQuote(row,body)'));
  for(const section of [confirmed,reconciled,afterSend]){
    assert.doesNotMatch(section,/await labPendingInbox\?\.remove\(row\.id\)/);
  }
  assert.doesNotMatch(confirmed,/sendTextInCurrentLab/);
  assert.doesNotMatch(reconciled,/sendTextInCurrentLab/);
});


test('corrupt encrypted startup releases only its own lock but never deletes the damaged record',async t=>{
  const f=await harness(t);const first=f.create();await first.initialize();
  await first.enqueue(candidate());
  await first.close();
  const filename=(await fs.readdir(f.rootDir)).find(name=>name.endsWith('.json'));
  const item=path.join(f.rootDir,filename);
  const original=await fs.readFile(item,'utf8');
  await fs.writeFile(item,'{"incomplete":true}');
  const restarted=f.create();
  await assert.rejects(restarted.initialize(),/LAB_PENDING_RECORD_INVALID/);
  assert.equal((await fs.readdir(f.rootDir)).includes('owner.lock'),false);
  assert.equal(await fs.readFile(item,'utf8'),'{"incomplete":true}');
  // Operator remediation, not silent recovery, is required for a broken record.
  await fs.writeFile(item,original);
  const recovered=f.create();await recovered.initialize();
  assert.equal((await recovered.snapshot()).pending,1);
  await recovered.close();
});

test('startup cleanup checks lock ownership token before removing lock on failure',async()=>{
  const src=await fs.readFile(new URL('../src/lab-pending-query-inbox.mjs',import.meta.url),'utf8');
  const block=src.slice(src.indexOf('    async initialize(){'),src.indexOf('    async read(messageId)',src.indexOf('    async initialize(){')));
  assert.match(block,/owned\?\.token===mine/);
  assert.doesNotMatch(block,/if\(mine\)\{try\{await fs\.rm\(lockFile\)/);
});


test('confirmed LAB queries finish ACK-only hints while still visible or backend offline',async()=>{
  const vm=await import('node:vm');
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=src.indexOf('async function resumePendingLabQueries(');
  const end=src.indexOf('let labTestProcessing=false;',start);
  assert.ok(start>=0&&end>start);
  const body=src.slice(start,end).trim();
  const entry={messageId:MESSAGE};
  for(const scenario of [
    {name:'confirmed visible offline, HMAC failure',state:'confirmed',visible:true,hint:false,online:false,
      expected:['journal-read','seen','save-seen','hint']},
    {name:'confirmed visible offline, HMAC success',state:'confirmed',visible:true,hint:true,online:false,
      expected:['journal-read','seen','save-seen','hint','remove']},
    {name:'unconfirmed out-of-DOM offline, no new send',state:null,visible:false,hint:true,online:false,
      expected:['journal-read']},
    {name:'ambiguous out-of-DOM offline, strict outgoing proof',state:'ambiguous',visible:false,hint:true,online:false,
      expected:['journal-read','pinned','outgoing-proof','confirm','seen','save-seen','hint','remove','logged']}
  ]){
    const actions=[];
    const context={
      lastLabPendingOffset:0,
      labPendingInbox:{
        list:async()=>[entry],
        remove:async()=>{actions.push('remove');}
      },
      backendState:scenario.online?'online':'offline',
      BACKEND_SYNC_ENABLED:true,
      labTestTagFor:()=> '[LABTEST:012345abcd]',
      labTestReplyJournal:{
        read:async()=>{actions.push('journal-read');return scenario.state?{state:scenario.state}:null;},
        confirm:async()=>{actions.push('confirm');}
      },
      rememberLabSeen:()=>{actions.push('seen');},
      saveLabSeenNow:async()=>{actions.push('save-seen');},
      rememberConfirmedPendingLabQuote:async()=>{actions.push('hint');return scenario.hint;},
      recoverConfirmedLabConversation:async()=>{},
      assertCurrentLabIdentity:async()=>{actions.push('pinned');},
      visibleLabHasTag:async()=>{actions.push('outgoing-proof');return true;},
      log:async()=>{actions.push('logged');}
    };
    const recover=vm.runInNewContext('('+body+')',context);
    await recover(new Set(scenario.visible?[MESSAGE]:[]));
    assert.deepEqual(actions,scenario.expected,scenario.name);
  }
  assert.match(body,/if \(visibleIds\.has\(entry\.messageId\) && state\?\.state !== 'confirmed'\) continue/);
  assert.match(body,/if \(backendState !== 'online'\) continue/);
});


test('initial AES key is atomically published under owner lock and orphan key stage is cleaned',async t=>{
  const f=await harness(t);
  // Model a crash before the key's staged bytes could become authoritative.
  const stage=path.join(f.rootDir,'inbox.key.'+crypto.randomUUID()+'.tmp');
  await fs.writeFile(stage,Buffer.from('incomplete-key'),{mode:0o600});
  const inbox=f.create();
  assert.deepEqual(await inbox.initialize(),{recovered:0});
  assert.equal((await fs.readdir(f.rootDir)).includes(path.basename(stage)),false);
  const key=await fs.readFile(path.join(f.rootDir,'inbox.key'));
  assert.equal(key.length,32);
  await inbox.enqueue(candidate());
  await inbox.close();

  const recovered=f.create();await recovered.initialize();
  assert.equal((await recovered.list()).length,1);
  assert.deepEqual(await fs.readFile(path.join(f.rootDir,'inbox.key')),key,
    'restart must never rotate the durable AES key');
  await recovered.close();
});

test('damaged existing AES key is never re-created or replaced on restart',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();await inbox.enqueue(candidate());await inbox.close();
  const keyFile=path.join(f.rootDir,'inbox.key');
  const goodKey=await fs.readFile(keyFile);
  const row=(await fs.readdir(f.rootDir)).find(name=>name.endsWith('.json'));
  const encryptedBefore=await fs.readFile(path.join(f.rootDir,row));
  const malformed=Buffer.from('bad-and-incomplete');
  await fs.writeFile(keyFile,malformed);
  const recovered=f.create();
  await assert.rejects(recovered.initialize(),/LAB_PENDING_KEY_INVALID/);
  assert.deepEqual(await fs.readFile(keyFile),malformed,'never silently rotate an existing key');
  assert.deepEqual(await fs.readFile(path.join(f.rootDir,row)),encryptedBefore,
    'failure never deletes encrypted business context');
  assert.equal((await fs.readdir(f.rootDir)).includes('owner.lock'),false,
    'failed bootstrap must release only its own lock');

  // Recovery is only possible with the original key, not a new random one.
  await fs.writeFile(keyFile,goodKey);
  const restored=f.create();await restored.initialize();
  assert.equal((await restored.snapshot()).pending,1);
  await restored.close();
});

test('missing AES key blocks startup while encrypted records remain and permits restoration',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();
  await inbox.enqueue(candidate());
  await inbox.close();
  const keyFile=path.join(f.rootDir,'inbox.key');
  const backupKey=path.join(f.rootDir,'inbox.key.operator-backup');
  const record=(await fs.readdir(f.rootDir)).find(name=>name.endsWith('.json'));
  const ciphertext=await fs.readFile(path.join(f.rootDir,record));
  await fs.rename(keyFile,backupKey);

  const reboot=f.create();
  await assert.rejects(reboot.initialize(),/LAB_PENDING_KEY_MISSING_WITH_RECORDS/);
  assert.equal((await fs.readdir(f.rootDir)).includes('inbox.key'),false,
    'must not silently rotate key when ciphertext already exists');
  assert.equal((await fs.readdir(f.rootDir)).includes('owner.lock'),false,
    'failed initialization must release its own owner lock');
  assert.deepEqual(await fs.readFile(path.join(f.rootDir,record)),ciphertext,
    'existing encrypted query is never destroyed during missing-key failure');

  await fs.rename(backupKey,keyFile);
  const restored=f.create();await restored.initialize();
  assert.equal((await restored.read(MESSAGE))?.text,TEXT,
    'original backed-up key recovers the durable encrypted query');
  await restored.close();
});

test('inbox source acquires owner lock before generating encryption key',async()=>{
  const src=await fs.readFile(new URL('../src/lab-pending-query-inbox.mjs',import.meta.url),'utf8');
  const init=src.slice(src.indexOf('    async initialize(){'),src.indexOf('    async read(messageId)'));
  assert.ok(init.indexOf('await lockOwner()')>=0);
  assert.ok(init.indexOf('await lockOwner()')<init.indexOf('key=await loadKey()'));
  assert.match(src,/await fs\.rename\(temp,keyFile\)/);
  assert.match(src,/await handle\.sync\(\)/);
});

test('rechecks original LAB TTL after a slow canonical HTTP response before sending',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function resumePendingLabQueries(');
  const end=source.indexOf('let labTestProcessing=false;',start);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end).trim();
  const actions=[];
  const entry=candidate();
  const context={
    lastLabPendingOffset:0,
    labPendingInbox:{
      list:async()=>[entry],
      read:async id=>{assert.equal(id,MESSAGE);actions.push('freshness-read');return null;}
    },
    backendState:'online',BACKEND_SYNC_ENABLED:true,
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{
      read:async()=>{actions.push('journal-read');return null;},
      prepare:async()=>{throw new Error('EXPIRED_QUERY_MUST_NOT_PREPARE');},
      begin:async()=>{throw new Error('EXPIRED_QUERY_MUST_NOT_BEGIN');}
    },
    classifyLocal:()=>({intent:'result'}),
    stableLabSenderKey:()=>SENDER,
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>entry.purpose,
    planLabConversation:()=>({scopeConflict:false}),
    checkLabSendEligibility:async()=>{actions.push('handoff-before');return{allowed:true}},
    labQueryBackoff:{
      allowed:()=>{actions.push('backoff-allowed');return true;},
      clear:()=>{actions.push('backoff-clear');}
    },
    queryCanonicalLab:async()=>{actions.push('canonical-read');return {available:true};},
    log:async message=>{
      assert.match(message,/^LAB_PENDING_EXPIRED_BEFORE_SEND id=/);
      actions.push('expired-log');
    }
  };
  const resume=vm.runInNewContext('('+body+')',context);
  await resume(new Set());
  assert.deepEqual(actions,[
    'journal-read','handoff-before','backoff-allowed','canonical-read','backoff-clear',
    'freshness-read','expired-log'
  ]);
});

test('visible LAB canonical response rechecks encrypted TTL before WAL send intent',async()=>{
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function processLabTestInput()');
  const end=source.indexOf('async function visibleLabHasTag(tag)',start);
  assert.ok(start>=0&&end>start);
  const live=source.slice(start,end);
  const canonical=live.indexOf('const canonical = inquiryPurpose');
  const guard=live.indexOf('if(inquiryPurpose && BACKEND_SYNC_ENABLED && labPendingInbox &&');
  const sendIntent=live.indexOf('await labTestReplyJournal.prepare(row.id)');
  assert.ok(canonical>=0&&guard>canonical&&sendIntent>guard);
  assert.match(live.slice(guard,sendIntent),/await labPendingInbox\.read\(row\.id\)/);
  assert.match(live.slice(guard,sendIntent),/LAB_PENDING_EXPIRED_BEFORE_SEND/);
  assert.match(live.slice(guard,sendIntent),/continue;/);
});

test('round-robin encrypted inbox visits later pending questions even when first 25 are blocked',async t=>{
  const f=await harness(t);
  const inbox=f.create();await inbox.initialize();
  const ids=[];
  for(let i=0;i<31;i++){
    const id='false_'+LAB+'_rr-'+String(i).padStart(3,'0')+'_'+SENDER;
    ids.push(id);
    await inbox.enqueue(candidate({messageId:id}));
  }
  const first=await inbox.list(25,{offset:0});
  const second=await inbox.list(25,{offset:25});
  assert.equal(first.length,25);
  assert.equal(second.length,25);
  const seen=new Set([...first,...second].map(row=>row.messageId));
  assert.equal(seen.size,31,'later queries must be offered even if first 25 cannot progress');
  assert.ok(second.some(row=>!first.some(prior=>prior.messageId===row.messageId)));
  assert.deepEqual(await inbox.list(25,{offset:0}),first,'stable order without mutation');
  assert.deepEqual((await inbox.snapshot()).pending,31);
  await assert.rejects(inbox.list(25,{offset:-1}),/LAB_PENDING_LIST_LIMIT_INVALID/);
  await assert.rejects(inbox.list(25,{offset:200}),/LAB_PENDING_LIST_LIMIT_INVALID/);
  await inbox.close();
});

test('live pending LAB poll always advances fair recovery cursor even if backend is offline',async()=>{
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const recovery=src.slice(src.indexOf('async function resumePendingLabQueries('),
    src.indexOf('let labTestProcessing=false;'));
  const get=recovery.indexOf('await labPendingInbox.list(25,{offset:lastLabPendingOffset})');
  const advance=recovery.indexOf('lastLabPendingOffset=(lastLabPendingOffset+Math.max(1,pending.length))%200');
  const backend=recovery.indexOf("if (backendState !== 'online') continue");
  assert.ok(get>=0&&advance>get&&backend>advance,
    'rotating selection must not wait for the backend or an ACK');
  assert.doesNotMatch(recovery.slice(get,backend),/sendTextInCurrentLab/);
});


test('live LAB recovery serves all 200 encrypted pending IDs within eight bounded polls',async()=>{
  const vm=await import('node:vm');
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=src.indexOf('async function resumePendingLabQueries(');
  const end=src.indexOf('let labTestProcessing=false;',start);
  assert.ok(start>=0&&end>start);
  const body=src.slice(start,end).trim();
  const all=Array.from({length:200},(_,i)=>({messageId:'round-robin-'+i}));
  const inspected=[];
  const offsets=[];
  const context={
    BACKEND_SYNC_ENABLED:true,
    lastLabPendingOffset:0,
    labPendingInbox:{
      list:async (limit,{offset}={})=>{
        assert.equal(limit,25,'at most 25 recovery candidates per poll');
        offsets.push(offset);
        return Array.from({length:limit},(_,i)=>all[(offset+i)%all.length]);
      }
    },
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{read:async messageId=>{inspected.push(messageId);return null;}}
  };
  const recover=vm.runInNewContext('('+body+')',context);
  const visibleIds=new Set(all.map(item=>item.messageId));
  for(let poll=1;poll<=8;poll++){
    await recover(visibleIds);
    assert.equal(inspected.length,poll*25,'bounded candidate count each poll');
    assert.equal(new Set(inspected).size,inspected.length,'no duplicate candidates within one rotation');
  }
  assert.deepEqual(offsets,[0,25,50,75,100,125,150,175]);
  assert.equal(new Set(inspected).size,200,'even all-visible and blocked messages cannot starve later IDs');
  assert.equal(context.lastLabPendingOffset,0,'volatile cursor wraps after the eighth poll');
  await recover(visibleIds);
  assert.deepEqual(inspected.slice(200),inspected.slice(0,25),'the next fair round begins at the first batch');
});

test('privacy-safe LAB health counters report age and expiry without exposing message identities',async t=>{
  const f=await harness(t);
  const inbox=f.create();
  await inbox.initialize();
  const empty=await inbox.snapshot();
  assert.deepEqual({
    pending:empty.pending,nearingExpiry:empty.nearingExpiry,
    oldestAgeSeconds:empty.oldestAgeSeconds
  },{pending:0,nearingExpiry:0,oldestAgeSeconds:0});
  await inbox.enqueue(candidate());
  const fresh=await inbox.snapshot();
  assert.equal(fresh.pending,1);
  assert.equal(fresh.nearingExpiry,0);
  assert.equal(fresh.oldestAgeSeconds,0);
  for(const forbidden of [MESSAGE,SENDER,TEXT,LAB,SOURCE,'La Rinconada']){
    assert.equal(JSON.stringify(fresh).includes(forbidden),false);
  }
  assert.equal(fresh.sourceWriteAllowed,false);
  assert.equal(fresh.deliveryAuthority,false);

  f.advance(8*60*1000+1000);
  const warning=await inbox.snapshot();
  assert.equal(warning.pending,1);
  assert.equal(warning.nearingExpiry,1);
  assert.equal(warning.oldestAgeSeconds,481);

  f.advance(2*60*1000);
  const expired=await inbox.snapshot();
  assert.equal(expired.pending,0);
  assert.equal(expired.nearingExpiry,0);
  assert.equal(expired.oldestAgeSeconds,0);
  await inbox.close();
});

test('Bridge health includes only aggregate LAB pending and near-expiry counters',async()=>{
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function printHealthSummary(');
  const end=source.indexOf('async function monitor()',start);
  const section=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(section,/await labPendingInbox\.snapshot\(\)/);
  assert.match(section,/labNearExpiry=\$\{pendingStatus\?\.nearingExpiry \?\? 0\}/);
  assert.match(section,/labOldestSec=\$\{pendingStatus\?\.oldestAgeSeconds \?\? 0\}/);
  assert.doesNotMatch(section,/pendingStatus\?\.text|pendingStatus\?\.senderId|pendingStatus\?\.quotedMessageId/);
});

test('LAB health reveals aggregate near-expiry pressure without leaking input identities',async t=>{
  const f=await harness(t);
  const inbox=f.create();
  await inbox.initialize();
  await inbox.enqueue(candidate());
  f.advance(240_000); // First message is four minutes old.
  const second='false_'+LAB+'_health-second_'+SENDER;
  await inbox.enqueue(candidate({
    messageId:second,
    messageTimestamp:new Date(740_000).toISOString()
  }));
  const early=await inbox.snapshot();
  assert.equal(early.pending,2);
  assert.equal(early.nearingExpiry,0);
  assert.equal(early.oldestAgeSeconds,240);
  assert.equal(early.sourceWriteAllowed,false);
  assert.equal(early.deliveryAuthority,false);
  f.advance(240_000); // First message reaches the 8-minute warning threshold.
  const warning=await inbox.snapshot();
  assert.equal(warning.pending,2);
  assert.equal(warning.nearingExpiry,1);
  assert.equal(warning.oldestAgeSeconds,480);
  for(const secret of [MESSAGE,second,SENDER,TEXT,LAB,SOURCE]){
    assert.equal(JSON.stringify(warning).includes(secret),false,
      'health cannot include any group/message/sender/text identifier');
  }
  f.advance(119_999);
  const beforeExpiry=await inbox.snapshot();
  assert.equal(beforeExpiry.pending,2);
  assert.equal(beforeExpiry.nearingExpiry,1);
  assert.equal(beforeExpiry.oldestAgeSeconds,599);
  f.advance(1); // No continued attempt after the original 10-minute TTL.
  const afterExpiry=await inbox.snapshot();
  assert.equal(afterExpiry.pending,1);
  assert.equal(afterExpiry.nearingExpiry,0);
  assert.equal(afterExpiry.oldestAgeSeconds,360);
  assert.equal(await inbox.read(MESSAGE),null);
  assert.notEqual(await inbox.read(second),null);
  await inbox.close();
});


test('confirmed ACK retains encrypted input until conversation context persistence succeeds',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function finalizeConfirmedVisibleLabQuote(');
  const end=source.indexOf('async function resumePendingLabQueries(',start);
  assert.ok(start>=0&&end>start);
  const helper=source.slice(start,end).trim();
  const original=candidate();
  let hintOk=true;
  const events=[];
  const finalize=vm.runInNewContext('('+helper+')',{
    labPendingInbox:{
      read:async()=>{events.push('read-original');return original;},
      remove:async()=>events.push('delete-original')
    },
    rememberConfirmedPendingLabQuote:async()=>{events.push('persist-hint');return hintOk;},
    log:async()=>{}
  });
  await finalize({id:MESSAGE},'visible text changed',{retainEncryptedInput:true});
  assert.deepEqual(events,['read-original','persist-hint'],
    'failed conversation persistence must not delete the only immutable input');
  events.length=0;
  await finalize({id:MESSAGE},'visible text changed',{retainEncryptedInput:false});
  assert.deepEqual(events,['read-original','persist-hint','delete-original']);
  events.length=0;
  hintOk=false;
  await finalize({id:MESSAGE},'visible text changed');
  assert.deepEqual(events,['read-original','persist-hint'],
    'failed quote persistence also retains encrypted original');

  const live=source.slice(source.indexOf('async function processLabTestInput()'),
    source.indexOf('async function visibleLabHasTag('));
  const ack=live.lastIndexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});');
  const persist=live.indexOf('await labConversationContext.remember(plan.sender',ack);
  const finalizer=live.indexOf('await finalizeConfirmedVisibleLabQuote(row,body,{retainEncryptedInput:!contextPersisted})',ack);
  assert.ok(ack>=0&&persist>ack&&finalizer>persist,
    'durable ACK must precede context persistence, which must precede inbox removal');
  assert.match(live.slice(persist,finalizer),/contextPersisted=false/);
  const recovery=source.slice(source.indexOf('async function resumePendingLabQueries('),
    source.indexOf('let labTestProcessing=false'));
  assert.match(recovery,/!entry\.race\|\|restored/);
  assert.match(live,/retainEncryptedInput:Boolean\(encryptedOriginal\?\.race\)&&!restored/);
});


test('canonical handoff during out-of-DOM LAB read cancels encrypted replay permanently',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const first=source.indexOf('async function resumePendingLabQueries(');
  const last=source.indexOf('let labTestProcessing=false;',first);
  assert.ok(first>=0&&last>first);
  const code=source.slice(first,last).trim();
  const entry=candidate();
  const events=[];
  const ctx={
    BACKEND_SYNC_ENABLED:true,backendState:'online',lastLabPendingOffset:0,
    INGEST_URL:'https://example.org/api/v1/hipico-bot/bridge/events',
    TOKEN:'fixture-only',LAB_GROUP_ID:LAB,LAB_CHANNEL_KEY:'lab-fixture',
    BACKEND_TIMEOUT_MS:4500,
    labPendingInbox:{
      list:async()=>[entry],
      remove:async id=>{assert.equal(id,MESSAGE);events.push('removed');},
      read:async()=>{throw new Error('NO_TTL_READ_AFTER_HANDOFF');}
    },
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{
      read:async()=>null,
      prepare:async()=>{throw new Error('NO_WAL_AFTER_HANDOFF');},
      begin:async()=>{throw new Error('NO_ENTER_AFTER_HANDOFF');}
    },
    classifyLocal:()=>({intent:'conversation',risk:'safe'}),
    stableLabSenderKey:()=>SENDER,
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>entry.purpose,
    planLabConversation:()=>({scopeConflict:false}),
    checkLabSendEligibility:async()=>{
      events.push('precheck-clear');
      return{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
    },
    labQueryBackoff:{
      allowed:()=>true,
      fail:()=>{throw new Error('HANDOFF_IS_NOT_RETRYABLE_NETWORK_ERROR');},
      clear:()=>{throw new Error('HANDOFF_CANNOT_CLEAR_PENDING_QUERY');}
    },
    queryCanonicalLab:async()=>{events.push('canonical-held');return{
      available:false,reason:'LAB_HANDOFF_HELD'
    };},
    rememberLabSeen:id=>{assert.equal(id,MESSAGE);events.push('seen');},
    saveLabSeenNow:async()=>{events.push('seen-saved');},
    log:async message=>{assert.match(message,/^LAB_PENDING_QUERY_HANDED_OFF id=/);events.push('logged');}
  };
  const recover=vm.runInNewContext('('+code+')',ctx);
  await recover(new Set());
  assert.deepEqual(events,[
    'precheck-clear','canonical-held','seen','seen-saved','removed','logged'
  ]);
});


test('real canonical transport propagates backend empty-text takeover to encrypted recovery',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const begin=source.indexOf('async function resumePendingLabQueries(');
  const end=source.indexOf('let labTestProcessing=false;',begin);
  assert.ok(begin>=0&&end>begin);
  const recover=source.slice(begin,end).trim();
  const original=candidate();
  const events=[];
  const context={
    BACKEND_SYNC_ENABLED:true,backendState:'online',lastLabPendingOffset:0,
    INGEST_URL:'https://example.org/api/v1/hipico-bot/bridge/events',
    TOKEN:'test-token',LAB_GROUP_ID:LAB,LAB_CHANNEL_KEY:'lab-integration',
    BACKEND_TIMEOUT_MS:4500,
    labPendingInbox:{
      list:async()=>[original],
      remove:async id=>{assert.equal(id,MESSAGE);events.push('removed');}
    },
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{
      read:async()=>null,
      prepare:async()=>{throw new Error('WAL_MUST_NOT_PREPARE');},
      begin:async()=>{throw new Error('ENTER_MUST_NOT_START');}
    },
    classifyLocal:()=>({intent:'conversation',risk:'safe'}),
    stableLabSenderKey:()=>SENDER,
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>original.purpose,
    planLabConversation:()=>({scopeConflict:false}),
    checkLabSendEligibility:async()=>{
      events.push('eligibility-clear');
      return{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
    },
    labQueryBackoff:{
      allowed:()=>true,
      fail:()=>{throw new Error('HANDOFF_MUST_NOT_BACKOFF');},
      clear:()=>{throw new Error('HANDOFF_MUST_NOT_CLEAR_BACKOFF');}
    },
    queryCanonicalLab:async args=>queryCanonicalLab({...args,fetchImpl:async(_url,options)=>{
      const request=JSON.parse(options.body);
      assert.equal(request.externalMessageId,MESSAGE);
      assert.equal(request.channelRole,'lab');
      assert.equal(request.shadowMode,true);
      assert.equal(request.senderId,SENDER);
      events.push('backend-handoff');
      return {
        status:200,headers:new Headers({'content-type':'application/json'}),
        text:async()=>JSON.stringify({
          ok:true,mode:'shadow',status:'LAB_HANDOFF_HELD',text:'',
          authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}
        })
      };
    }}),
    rememberLabSeen:id=>{assert.equal(id,MESSAGE);events.push('seen');},
    saveLabSeenNow:async()=>{events.push('saved');},
    log:async message=>{
      assert.match(message,/^LAB_PENDING_QUERY_HANDED_OFF id=/);
      events.push('logged');
    }
  };
  await vm.runInNewContext('('+recover+')',context)(new Set());
  assert.deepEqual(events,[
    'eligibility-clear','backend-handoff','seen','saved','removed','logged'
  ]);
});


test('persisted human LAB handoff marker prevents requery after interrupted encrypted deletion',async()=>{
  const vm=await import('node:vm');
  const index=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const begin=index.indexOf('async function resumePendingLabQueries(');
  const end=index.indexOf('let labTestProcessing=false;',begin);
  assert.ok(begin>=0&&end>begin);
  const entry=candidate(),seen=new Set(),events=[];
  let removeCalls=0,reads=0;
  const ctx={
    BACKEND_SYNC_ENABLED:true,backendState:'online',lastLabPendingOffset:0,
    INGEST_URL:'https://example.org/api/v1/hipico-bot/bridge/events',
    TOKEN:'fixture-only',LAB_GROUP_ID:LAB,LAB_CHANNEL_KEY:'lab-fixture',BACKEND_TIMEOUT_MS:4500,
    labPendingInbox:{
      list:async()=>[entry],
      remove:async id=>{
        assert.equal(id,MESSAGE);
        removeCalls++;
        events.push('remove');
        if(removeCalls===1)throw new Error('CRASH_AFTER_SEEN_FSYNC');
      }
    },
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{
      read:async()=>null,
      prepare:async()=>{throw new Error('NEVER_PREPARE_WAL');}
    },
    classifyLocal:()=>({intent:'conversation',risk:'safe'}),
    stableLabSenderKey:()=>SENDER,
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>entry.purpose,
    planLabConversation:()=>({scopeConflict:false}),
    checkLabSendEligibility:async()=>({allowed:true,reason:'LAB_HANDOFF_CLEAR'}),
    labQueryBackoff:{
      allowed:()=>true,
      fail:()=>{throw new Error('NEVER_BACKOFF_A_TERMINAL_HANDOFF');},
      clear:()=>{throw new Error('NEVER_CLEAR_TERMINAL_BACKOFF');}
    },
    queryCanonicalLab:async()=>{
      reads++;
      if(reads!==1)throw new Error('NEVER_REQUERY_A_TERMINAL_HANDOFF');
      return{available:false,reason:'LAB_HANDOFF_HELD'};
    },
    rememberLabSeen:id=>{assert.equal(id,MESSAGE);seen.add(id);events.push('seen');},
    saveLabSeenNow:async()=>{assert.ok(seen.has(MESSAGE));events.push('fsync');},
    log:async value=>events.push(value.includes('ALREADY_HANDLED')?'terminal':'handoff')
  };
  const resume=vm.runInNewContext('('+index.slice(begin,end).trim()+')',ctx);
  await assert.rejects(resume(new Set(),seen),/CRASH_AFTER_SEEN_FSYNC/);
  assert.ok(seen.has(MESSAGE),'durable mark was saved before removal failed');
  events.push('restart');
  await resume(new Set(),seen);
  assert.equal(reads,1,'no canonical replay when a terminal seen entry survived restart');
  assert.equal(removeCalls,2,'residual ciphertext is cleaned');
  assert.deepEqual(events,['seen','fsync','remove','restart','remove','terminal']);
});

test('previously seen confirmed or ambiguous LAB replies still reconcile by ACK evidence only',async()=>{
  const vm=await import('node:vm');
  const src=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const recovery=src.slice(src.indexOf('async function resumePendingLabQueries('),
    src.indexOf('let labTestProcessing=false;')).trim();
  for(const state of ['confirmed','ambiguous']){
    const calls=[];
    const context={
      BACKEND_SYNC_ENABLED:true,backendState:'offline',lastLabPendingOffset:0,
      labPendingInbox:{
        list:async()=>[candidate()],
        remove:async()=>calls.push('remove')
      },
      labTestTagFor:()=> '[LABTEST:012345abcd]',
      labTestReplyJournal:{
        read:async()=>({state,updatedAt:'2026-10-13T03:00:00Z'}),
        confirm:async()=>({state:'confirmed',updatedAt:'2026-10-13T03:00:00Z'})
      },
      assertCurrentLabIdentity:async()=>calls.push('identity'),
      visibleLabHasTag:async()=>true,
      recoverConfirmedLabConversation:async()=>{calls.push('context');return true;},
      rememberLabSeen:()=>calls.push('seen'),
      saveLabSeenNow:async()=>calls.push('save'),
      rememberConfirmedPendingLabQuote:async()=>{calls.push('hint');return true;},
      log:async()=>calls.push('log')
    };
    await vm.runInNewContext('('+recovery+')',context)(new Set(),new Set([MESSAGE]));
    assert.ok(calls.includes('context')&&calls.includes('hint')&&calls.includes('remove'),state);
    assert.equal(calls.includes('query'),false);
  }
});


test('operator takeover fsync precedes retryable WAL in both LAB send routes',async()=>{
  const vm=await import('node:vm');
  const index=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const sections=[
    ['pending',index.slice(index.indexOf('async function resumePendingLabQueries('),
      index.indexOf('let labTestProcessing=false;')),'entry.messageId'],
    ['visible',index.slice(index.indexOf('async function processLabTestInput()'),
      index.indexOf('async function visibleLabHasTag(')),'row.id']
  ];
  for(const [label,section,id] of sections){
    const begin=section.indexOf('const eligibleToSend=await checkLabSendEligibility(eligibilityArgs)');
    const stop=section.indexOf('continue;\n      }',begin);
    assert.ok(begin>=0&&stop>begin,label+' send gate');
    const snippet=section.slice(begin,stop+'continue;\n      }'.length);
    const seen=snippet.indexOf('rememberLabSeen('+id+')');
    const fsync=snippet.indexOf('await saveLabSeenNow()');
    const retry=snippet.indexOf('await labTestReplyJournal.retryPrepared('+id+')');
    const remove=snippet.indexOf('await labPendingInbox');
    assert.ok(seen>=0&&fsync>seen&&retry>fsync&&remove>retry,label+' order');
    const wrap='(async()=>{for(const once of [true]){'+snippet+'}})()';
    const events=[];
    let saved=false;
    const ctx={
      eligibilityArgs:{},tag:'[LABTEST:012345abcd]',
      checkLabSendEligibility:async()=>({allowed:false,reason:'LAB_HANDOFF_HELD'}),
      row:{id:MESSAGE},entry:{messageId:MESSAGE},
      rememberLabSeen:()=>events.push('seen'),
      saveLabSeenNow:async()=>{saved=true;events.push('fsync')},
      labTestReplyJournal:{retryPrepared:async()=>{
        assert.equal(saved,true,'no retryable WAL before durable handoff');
        events.push('prepared');
      }},
      labPendingInbox:{remove:async()=>events.push('removed')},
      log:async()=>events.push('logged')
    };
    await vm.runInNewContext(wrap,ctx);
    assert.deepEqual(events,['seen','fsync','prepared','removed','logged'],label);
    const broken=[];
    const failedCtx={
      ...ctx,
      rememberLabSeen:()=>broken.push('seen'),
      saveLabSeenNow:async()=>{broken.push('fsync-failed');throw new Error('DISK_WRITE_FAILED')},
      labTestReplyJournal:{retryPrepared:async()=>broken.push('UNSAFE_PREPARED')},
      labPendingInbox:{remove:async()=>broken.push('UNSAFE_REMOVE')},
      log:async()=>broken.push('UNSAFE_LOG')
    };
    await assert.rejects(vm.runInNewContext(wrap,failedCtx),/DISK_WRITE_FAILED/);
    assert.deepEqual(broken,['seen','fsync-failed'],label);
  }
});


test('late human takeover with failed seen fsync stays ambiguous, never permits another LAB Enter',async()=>{
  const vm=await import('node:vm');
  const file=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const begin=file.indexOf('async function resumePendingLabQueries(');
  const end=file.indexOf('let labTestProcessing=false;',begin);
  assert.ok(begin>=0&&end>begin);
  const original=candidate();
  const events=[];
  let checks=0,state=null;
  const ctx={
    BACKEND_SYNC_ENABLED:true,backendState:'online',lastLabPendingOffset:0,
    INGEST_URL:'https://example.org/api/v1/hipico-bot/bridge/events',
    TOKEN:'fixture',LAB_GROUP_ID:LAB,LAB_CHANNEL_KEY:'lab-fixture',BACKEND_TIMEOUT_MS:4500,
    labPendingInbox:{
      list:async()=>[original],
      read:async()=>original,
      remove:async()=>{throw new Error('NO_REMOVE_BEFORE_DURABLE_HANDOFF');}
    },
    labTestTagFor:()=> '[LABTEST:012345abcd]',
    labTestReplyJournal:{
      read:async()=>state===null?null:{state},
      prepare:async()=>{state='prepared';events.push('prepare');},
      begin:async()=>{state='sending';events.push('begin');},
      retryPrepared:async()=>{throw new Error('UNSAFE_RETRYABLE_WAL');},
      markAmbiguous:async()=>{
        assert.equal(state,'sending');
        state='ambiguous';events.push('ambiguous');
      },
      confirm:async()=>{throw new Error('NO_CONFIRMED_SEND');}
    },
    classifyLocal:()=>({risk:'safe',intent:'conversation'}),
    stableLabSenderKey:()=>SENDER,
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>original.purpose,
    planLabConversation:()=>({scopeConflict:false}),
    checkLabSendEligibility:async()=>{
      checks++;
      events.push('gate-'+checks);
      return checks===3?{allowed:false,reason:'LAB_HANDOFF_HELD'}
        :{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
    },
    labQueryBackoff:{
      allowed:()=>true,clear:()=>{},fail:()=>{throw new Error('NO_QUERY_BACKOFF');}
    },
    queryCanonicalLab:async()=>({available:true,text:'Respuesta interna'}),
    rememberLabSeen:()=>events.push('seen-in-memory'),
    saveLabSeenNow:async()=>{events.push('fsync-failed');throw new Error('DISK_UNAVAILABLE');},
    labSeenOutcome:()=> 'AMBIGUOUS',
    labTestAmbiguousCount:0,
    sendTextInCurrentLab:async()=>{throw new Error('NO_ENTER_AFTER_HANDOFF');},
    log:async()=>events.push('logged')
  };
  await vm.runInNewContext('('+file.slice(begin,end).trim()+')',ctx)(new Set(),new Set());
  assert.equal(checks,3);
  assert.equal(state,'ambiguous');
  assert.equal(ctx.labTestAmbiguousCount,1);
  assert.ok(events.indexOf('fsync-failed')>events.indexOf('begin'));
  assert.ok(events.includes('ambiguous'));
  assert.equal(events.includes('logged'),true);
});


test('non-handoff eligibility outage before LAB Enter rolls back WAL without terminal human marker',async()=>{
  const vm=await import('node:vm');
  const index=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const sections=[
    ['pending',index.slice(index.indexOf('async function resumePendingLabQueries('),
      index.indexOf('let labTestProcessing=false;'))],
    ['visible',index.slice(index.indexOf('async function processLabTestInput()'),
      index.indexOf('async function visibleLabHasTag('))]
  ];
  for(const [label,section] of sections){
    const begin=section.indexOf('const eligibleToSend=await checkLabSendEligibility(eligibilityArgs)');
    const stop=section.indexOf('continue;\n      }',begin);
    assert.ok(begin>=0&&stop>begin,label);
    const gate=section.slice(begin,stop+'continue;\n      }'.length);
    const calls=[];
    const context={
      eligibilityArgs:{},tag:'[LABTEST:012345abcd]',
      row:{id:MESSAGE},entry:{messageId:MESSAGE},
      checkLabSendEligibility:async()=>({
        allowed:false,reason:'LAB_HANDOFF_UNAVAILABLE'
      }),
      rememberLabSeen:()=>{throw new Error('OUTAGE_IS_NOT_HUMAN_TAKEOVER');},
      saveLabSeenNow:async()=>{throw new Error('OUTAGE_MUST_NOT_PERSIST_TERMINAL_SEEN');},
      labTestReplyJournal:{
        retryPrepared:async id=>{assert.equal(id,MESSAGE);calls.push('prepared');}
      },
      labPendingInbox:{
        remove:async()=>{throw new Error('OUTAGE_MUST_RETAIN_ENCRYPTED_INBOX');}
      },
      log:async msg=>{
        assert.match(msg,/LAB_HANDOFF_UNAVAILABLE/);
        calls.push('logged');
      }
    };
    await vm.runInNewContext('(async()=>{for(const once of [true]){'+gate+'}})()',context);
    assert.deepEqual(calls,['prepared','logged'],label);
  }
});


test('failed encrypted deletion after fsynced handoff does not reclassify pre-Enter WAL as ambiguous',async()=>{
  const vm=await import('node:vm');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const chunks=[
    ['pending',source.slice(source.indexOf('async function resumePendingLabQueries('),
      source.indexOf('let labTestProcessing=false;'))],
    ['visible',source.slice(source.indexOf('async function processLabTestInput()'),
      source.indexOf('async function visibleLabHasTag('))]
  ];
  for(const [label,section] of chunks){
    const begin=section.indexOf('const eligibleToSend=await checkLabSendEligibility(eligibilityArgs)');
    const stop=section.indexOf('continue;\n      }',begin);
    assert.ok(begin>=0&&stop>begin,label);
    const gate=section.slice(begin,stop+'continue;\n      }'.length);
    const events=[];
    let durable=false,wal='sending';
    const context={
      eligibilityArgs:{},tag:'[LABTEST:012345abcd]',
      row:{id:MESSAGE},entry:{messageId:MESSAGE},
      checkLabSendEligibility:async()=>({allowed:false,reason:'LAB_HANDOFF_HELD'}),
      rememberLabSeen:()=>events.push('seen'),
      saveLabSeenNow:async()=>{durable=true;events.push('fsync')},
      labTestReplyJournal:{
        retryPrepared:async()=>{
          assert.equal(durable,true);
          wal='prepared';
          events.push('prepared');
        },
        markAmbiguous:async()=>{throw new Error('PRE_ENTER_CANCEL_IS_NOT_AMBIGUOUS');}
      },
      labPendingInbox:{
        remove:async()=>{events.push('remove-failed');throw new Error('DISK_REMOVE_FAILED');}
      },
      log:async line=>events.push(line.includes('CLEANUP_DEFERRED')?'deferred':'gate-logged')
    };
    await vm.runInNewContext('(async()=>{for(const once of [true]){'+gate+'}})()',context);
    assert.equal(wal,'prepared');
    assert.deepEqual(events,[
      'seen','fsync','prepared','remove-failed','deferred','gate-logged'
    ],label);
  }
});

test('inbox rejects an existing POSIX AES key readable by other users without deleting ciphertext',async t=>{
  const f=await harness(t);
  const first=f.create();await first.initialize();
  await first.enqueue(candidate());
  const keyFile=path.join(f.rootDir,'inbox.key');
  const originalKey=await fs.readFile(keyFile);
  const ciphertextFile=(await fs.readdir(f.rootDir)).find(name=>name.endsWith('.json')&&name.length===69);
  assert.ok(ciphertextFile);
  const ciphertextPath=path.join(f.rootDir,ciphertextFile);
  const originalCiphertext=await fs.readFile(ciphertextPath);
  await first.close();

  if(process.platform==='win32'){
    // chmod mode bits cannot establish or audit NTFS ACLs on Windows.
    const restarted=f.create();await restarted.initialize();
    assert.equal((await restarted.read(MESSAGE))?.messageId,MESSAGE);
    await restarted.close();
    return;
  }

  await fs.chmod(keyFile,0o644);
  t.after(()=>fs.chmod(keyFile,0o600).catch(()=>{}));
  assert.notEqual((await fs.stat(keyFile)).mode & 0o077,0);
  const unsafe=f.create();
  await assert.rejects(unsafe.initialize(),/LAB_PENDING_KEY_PERMISSIONS_UNSAFE/);
  assert.deepEqual(await fs.readFile(keyFile),originalKey,
    'startup must not silently rotate or rewrite an exposed key');
  assert.deepEqual(await fs.readFile(ciphertextPath),originalCiphertext,
    'unsafe permissions must not erase or modify encrypted pending requests');

  await fs.chmod(keyFile,0o600);
  const recovered=f.create();await recovered.initialize();
  assert.equal((await recovered.read(MESSAGE))?.messageId,MESSAGE);
  await recovered.close();
});
