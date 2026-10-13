import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createLabQuotedRaceJournal} from '../src/lab-quoted-race-journal.mjs';

const LAB='120363222222222222@g.us';
const SOURCE='120363111111111111@g.us';
const SENDER='123456789012@lid';
const OTHER='234567890123@lid';
const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
const msg=(name,sender=SENDER,lab=LAB)=>'false_'+lab+'_'+name+'_'+sender;
const fixture=async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-quoted-hints-'));
  const file=path.join(dir,'private','quoted.json');
  let clock=Date.parse('2026-10-12T15:00:00.000Z');
  const make=(overrides={})=>createLabQuotedRaceJournal({
    file,labGroupId:LAB,sourceGroupId:SOURCE,now:()=>clock,
    ...overrides
  });
  return{dir,file,make,now:(ms)=>{clock=ms;},clean:()=>fs.rm(dir,{recursive:true,force:true})};
};

test('only a confirmed LAB ACK can create a quoted race hint',async()=>{
  const f=await fixture();
  try{
    const journal=f.make();
    await journal.initialize();
    await assert.rejects(()=>journal.remember({
      messageId:msg('one'),senderId:SENDER,race
    }),/LAB_QUOTE_CONFIRMED_ACK_REQUIRED/);
    assert.equal(journal.snapshot().count,0);
    await journal.remember({messageId:msg('one'),senderId:SENDER,race,confirmed:true});
    assert.deepEqual(journal.lookup({
      quotedMessageId:msg('one'),senderId:SENDER,currentMessageId:msg('reply')
    }),race);
    assert.equal(journal.snapshot().count,1);
  }finally{await f.clean();}
});

test('private journal survives restart without storing messages, IDs, phone JIDs or chat bodies',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    await j.initialize();
    await j.remember({messageId:msg('private-message'),senderId:SENDER,race,confirmed:true});
    const raw=await fs.readFile(f.file,'utf8');
    assert.doesNotMatch(raw,/private-message|123456789012|120363222222222222|carrera\s*5|Bearer/i);
    assert.match(raw,/"raceNumber": 5/);
    if(process.platform!=='win32'){
      assert.equal((await fs.stat(f.file)).mode&0o777,0o600);
      assert.equal((await fs.stat(path.dirname(f.file))).mode&0o777,0o700);
    }
    const restarted=f.make();
    await restarted.initialize();
    assert.deepEqual(restarted.lookup({
      quotedMessageId:msg('private-message'),senderId:SENDER,currentMessageId:msg('reply')
    }),race);
  }finally{await f.clean();}
});

test('scope pins prevent cross-group or cross-participant context inheritance',async()=>{
  const f=await fixture();
  try{
    const j=f.make();await j.initialize();
    await j.remember({messageId:msg('one'),senderId:SENDER,race,confirmed:true});
    for(const input of [
      {quotedMessageId:msg('one'),senderId:OTHER,currentMessageId:msg('reply',OTHER)},
      {quotedMessageId:msg('one',SENDER,'120363333333333333@g.us'),senderId:SENDER,currentMessageId:msg('reply')},
      {quotedMessageId:msg('one'),senderId:SENDER,currentMessageId:msg('reply',OTHER)},
      {quotedMessageId:msg('one'),senderId:SENDER,currentMessageId:msg('one')},
      {quotedMessageId:msg('missing'),senderId:SENDER,currentMessageId:msg('reply')}
    ])assert.equal(j.lookup(input),null);
    await assert.rejects(()=>f.make({labGroupId:'120363333333333333@g.us'}).initialize(),/LAB_QUOTE_JOURNAL_INVALID/);
    assert.throws(()=>f.make({sourceGroupId:LAB}),/LAB_QUOTE_GROUP_PIN_REQUIRED/);
  }finally{await f.clean();}
});

test('expired hints are unavailable, including after restarting the Bridge',async()=>{
  const f=await fixture();
  try{
    const base=Date.parse('2026-10-12T15:00:00.000Z');
    const j=f.make({ttlMs:1000});await j.initialize();
    await j.remember({messageId:msg('one'),senderId:SENDER,race,confirmed:true});
    f.now(base+999);
    assert.deepEqual(j.lookup({quotedMessageId:msg('one'),senderId:SENDER,currentMessageId:msg('reply')}),race);
    f.now(base+1000);
    assert.equal(j.lookup({quotedMessageId:msg('one'),senderId:SENDER,currentMessageId:msg('reply')}),null);
    const restarted=f.make({ttlMs:1000});await restarted.initialize();
    assert.equal(restarted.snapshot().count,0);
  }finally{await f.clean();}
});

test('bounded context retains only the most recent entries',async()=>{
  const f=await fixture();
  try{
    const base=Date.parse('2026-10-12T15:00:00.000Z');
    const j=f.make({maxEntries:2});await j.initialize();
    for(let i=0;i<3;i++){
      f.now(base+i*100);
      await j.remember({messageId:msg('message-'+i),senderId:SENDER,race,confirmed:true});
    }
    assert.equal(j.snapshot().count,2);
    assert.equal(j.lookup({quotedMessageId:msg('message-0'),senderId:SENDER,currentMessageId:msg('reply')}),null);
    assert.deepEqual(j.lookup({quotedMessageId:msg('message-2'),senderId:SENDER,currentMessageId:msg('reply')}),race);
  }finally{await f.clean();}
});

test('malformed, tampered and foreign-scope persisted hint files fail closed',async()=>{
  const f=await fixture();
  try{
    const j=f.make();await j.initialize();
    await j.remember({messageId:msg('one'),senderId:SENDER,race,confirmed:true});
    const raw=await fs.readFile(f.file,'utf8');
    await fs.writeFile(f.file,raw.replace('"raceNumber": 5','"raceNumber": 0'));
    await assert.rejects(()=>f.make().initialize(),/LAB_QUOTE_JOURNAL_INVALID/);
    await fs.writeFile(f.file,raw.replace('"scopeHash":','"otherScopeHash":'));
    await assert.rejects(()=>f.make().initialize(),/LAB_QUOTE_JOURNAL_INVALID/);
    await fs.writeFile(f.file,raw);
    assert.deepEqual((await fs.readFile(f.file,'utf8')),raw);
  }finally{await f.clean();}
});

test('symlink quote journal fails closed without reading outside target',async(t)=>{
  if(process.platform==='win32'){t.skip('Windows symlink restrictions');return;}
  const f=await fixture();
  try{
    await fs.mkdir(path.dirname(f.file),{recursive:true});
    const external=path.join(f.dir,'external.json');
    await fs.writeFile(external,'{"secret":"do-not-leak"}');
    await fs.symlink(external,f.file);
    await assert.rejects(()=>f.make().initialize(),/LAB_QUOTE_JOURNAL_INVALID/);
    assert.equal(await fs.readFile(external,'utf8'),'{"secret":"do-not-leak"}');
  }finally{await f.clean();}
});

test('invalid race, invalid ID and unpinned group never persist a context hint',async()=>{
  const f=await fixture();
  try{
    const j=f.make();await j.initialize();
    for(const partial of [
      {race:{...race,raceNumber:0}},
      {race:{...race,raceDate:'2026-02-30'}},
      {race:{...race,racetrack:'Bad<script>'}},
      {messageId:'random-message-not-lab'},
      {senderId:'Unknown'}
    ]){
      await assert.rejects(()=>j.remember({
        messageId:msg('one'),senderId:SENDER,race,confirmed:true,...partial
      }),/LAB_QUOTE_INPUT_INVALID/);
    }
    assert.equal(j.snapshot().count,0);
  }finally{await f.clean();}
});

test('Bridge lookup is before LAB query and hint is saved only after confirmed ACK',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const code=await fs.readFile(path.join(root,'src','index.mjs'),'utf8');
  const start=code.indexOf('async function processLabTestInput()');
  const end=code.indexOf('async function visibleLabHasTag(tag)',start);
  const block=code.slice(start,end);
  assert.ok(start>=0&&end>start);
  const lookup=block.indexOf('labQuotedRaceJournal?.lookup(');
  const query=block.indexOf('await queryCanonicalLab({');
  const ack=block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',query);
  const remember=block.indexOf('labQuotedRaceJournal.remember(',ack);
  assert.ok(lookup>=0&&query>lookup&&ack>query&&remember>ack);
  assert.match(block,/quotedMessageId:row.quotedId,senderId:sender,currentMessageId:row.id/);
  assert.match(block,/confirmed:true/);
  assert.match(block,/LAB_QUOTE_HINT_PERSIST_FAILED/);
  assert.match(block,/labTestReplyJournal\.begin\(row\.id\)/);
  assert.doesNotMatch(block,/sendTextInCurrentSource/);
});
