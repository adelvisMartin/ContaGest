import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stableLabSenderKey} from '../src/lab-conversation-context.mjs';
import {classifyLocal} from '../src/runtime-utils.mjs';
import {confirmedLabQuoteHint} from '../src/lab-confirmed-quote-hint.mjs';

const bridge=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const start=bridge.indexOf('async function rememberConfirmedPendingLabQuote(');
const end=bridge.indexOf('async function finalizeConfirmedVisibleLabQuote(',start);
assert.ok(start>=0&&end>start,'post-ACK hint authority helper must exist');
const originalHelper=bridge.slice(start,end).trim();
const senderId='123456789012@lid';
const id='false_120363222222222222@g.us_incoming-1_'+senderId;
const explicit='¿Cuál es el estado de carrera 5 en La Rinconada el 2026-10-12?';
const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
const entry=(text=explicit,extra={})=>({
  messageId:id,senderId,text,purpose:'status',
  race:{...race},messageTimestamp:'2026-10-12T19:00:00.000Z',
  quotedMessageId:null,...extra
});
function helper(){
  const persisted=[],events=[];
  const fn=vm.runInNewContext('('+originalHelper+')',{
    labQuotedRaceJournal:{remember:async item=>{
      persisted.push(item);events.push('persist');
    }},
    stableLabSenderKey,classifyLocal,confirmedLabQuoteHint,
    log:async()=>events.push('log')
  });
  return{fn,persisted,events};
}

test('confirmed LAB ACK stores a verified single explicit race from immutable encrypted input',async()=>{
  const r=helper();
  assert.equal(await r.fn(entry()),true);
  assert.equal(r.persisted.length,1);
  assert.equal(r.persisted[0].messageId,id);
  assert.equal(r.persisted[0].senderId,senderId);
  assert.deepEqual({...r.persisted[0].race},race);
  assert.equal(r.persisted[0].confirmed,true);
});

test('ambiguous races are not promoted into HMAC quote hints after a durable ACK',async()=>{
  for(const text of [
    explicit.replace('?', ' o carrera 6?'),
    explicit.replace('?', ' o 6ta?'),
    explicit.replace('?', ' o la sexta?'),
    explicit.replace('?', ' o carrera 99?')
  ]){
    const r=helper();
    assert.equal(await r.fn(entry(text)),true);
    assert.equal(r.persisted.length,0,text);
  }
});

test('encrypted race differing from original verified text cannot be published as an ACK hint',async()=>{
  for(const forged of [
    {raceNumber:6,racetrack:'La Rinconada',raceDate:'2026-10-12'},
    {raceNumber:5,racetrack:'Otro Hipódromo',raceDate:'2026-10-12'},
    {raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-11'},
    null
  ]){
    const r=helper();
    assert.equal(await r.fn(entry(explicit,{race:forged})),true);
    assert.equal(r.persisted.length,0);
  }
});

test('unsafe money, impossible dates, unstable sender and no original scope never emit hint',async()=>{
  const unsafe=[
    entry('¿Estado de carrera 5 en La Rinconada el 2026-10-12 y pagar premio?'),
    entry('¿Estado de carrera 5 en La Rinconada el 2026-02-30?'),
    entry(explicit,{senderId:'000000000000@lid'}),
    entry('¿Cuál es el estado de esa carrera?')
  ];
  for(const item of unsafe){
    const r=helper();
    assert.equal(await r.fn(item),true);
    assert.equal(r.persisted.length,0);
  }
});

test('private hint write failures preserve the encrypted inbox for ACK-only retry',async()=>{
  const calls=[];
  const fn=vm.runInNewContext('('+originalHelper+')',{
    labQuotedRaceJournal:{remember:async()=>{
      calls.push('persist');throw new Error('disk-full');
    }},
    stableLabSenderKey,classifyLocal,confirmedLabQuoteHint,
    log:async reason=>{calls.push(reason);}
  });
  assert.equal(await fn(entry()),false);
  assert.deepEqual(calls,['persist','LAB_QUOTE_HINT_PERSIST_FAILED']);
});

test('the helper cannot send WhatsApp, fabricate canonical data or change SOURCE',()=>{
  assert.doesNotMatch(originalHelper,/sendTextInCurrentLab|sendTextInCurrentSource|queryCanonicalLab|labTestReplyJournal\.confirm/);
  assert.match(originalHelper,/confirmedLabQuoteHint\(/);
  assert.doesNotMatch(originalHelper,/const race=explicitLabRaceScope\(entry\.text\)/);
});
