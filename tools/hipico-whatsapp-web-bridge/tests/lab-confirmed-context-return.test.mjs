import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const bridge=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const start=bridge.indexOf('async function recoverConfirmedLabConversation(');
const finish=bridge.indexOf('async function rememberConfirmedPendingLabQuote(',start);
assert.ok(start>=0&&finish>start);
const actual=bridge.slice(start,finish).trim();
const group='120363222222222222@g.us';
const sender='123456789012@lid';
const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
const msg={
  messageId:'false_'+group+'_original_'+sender,
  senderId:sender,
  text:'¿Cuál es el estado de carrera 5 en La Rinconada el 2026-10-12?',
  purpose:'status',race
};
const ack='2026-10-12T19:00:00.000Z';

function build(recoverConfirmed,override={}){
  const calls=[],logs=[];
  const fn=vm.runInNewContext('('+actual+')',{
    labConversationContext:{recoverConfirmed:async(...args)=>{
      calls.push(args);
      return await recoverConfirmed(...args);
    }},
    stableLabSenderKey:()=>sender,
    classifyLocal:()=>({risk:'safe',intent:'conversation'}),
    labReadOnlyQueryPurpose:()=> 'status',
    planLabConversation:()=>({scopeConflict:false,raceScope:race}),
    log:async text=>logs.push(text),
    ...override
  });
  return{fn,calls,logs};
}

test('declined context restore is NOT reported as a completed durable ACK backfill',async()=>{
  const r=build(async()=>false);
  assert.equal(await r.fn(msg,ack),false);
  assert.equal(r.calls.length,1);
  assert.equal(r.calls[0][0],sender);
  assert.equal(r.calls[0][2],ack);
});

test('only an explicit persisted true permits marking encrypted ACK memory restored',async()=>{
  for(const returned of [true,false,undefined,null,1,'true']){
    const r=build(async()=>returned);
    assert.equal(await r.fn(msg,ack),returned===true,String(returned));
    assert.equal(r.calls.length,1);
  }
});

test('a durable storage error leaves recovery false and records a non-sensitive reason',async()=>{
  const r=build(async()=>{throw new Error('disk-full');});
  assert.equal(await r.fn(msg,ack),false);
  assert.deepEqual(r.logs,['LAB_CONTEXT_ACK_RECOVERY_FAILED']);
});

test('changed sender, missing race, invalid purpose and scope conflicts never invoke restore',async()=>{
  for(const [entry,override] of [
    [{...msg,senderId:'999999999999@lid'},{}],
    [{...msg,race:null},{}],
    [{...msg,purpose:'result'},{}],
    [msg,{planLabConversation:()=>({scopeConflict:true,raceScope:race})}]
  ]){
    const r=build(async()=>true,override);
    assert.equal(await r.fn(entry,ack),false);
    assert.equal(r.calls.length,0);
  }
});

test('post-ACK inbox retention is gated by the actual restoration result',()=>{
  const recovery=bridge.slice(bridge.indexOf('async function resumePendingLabQueries('),
    bridge.indexOf('let labTestProcessing=false;',bridge.indexOf('async function resumePendingLabQueries(')));
  const confirmed=recovery.slice(recovery.indexOf("if (state?.state === 'confirmed')"),
    recovery.indexOf("if (state?.state === 'sending'"));
  assert.match(confirmed,/const restored=await recoverConfirmedLabConversation\(entry,state\.updatedAt\)/);
  assert.match(confirmed,/!entry\.race\|\|restored/);
  assert.match(confirmed,/await labPendingInbox\.remove\(entry\.messageId\)/);
  assert.doesNotMatch(confirmed,/sendTextInCurrentLab/);
});
