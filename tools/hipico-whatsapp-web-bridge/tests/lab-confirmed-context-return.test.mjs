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

test('visible LAB ACK remembers context only on explicit durable true',async()=>{
  const start=bridge.indexOf('async function processLabTestInput()');
  const end=bridge.indexOf('async function visibleLabHasTag(tag)',start);
  const live=bridge.slice(start,end);
  const a=live.indexOf('let contextPersisted=!plan.rememberRace;');
  const b=live.indexOf('processed += 1;',a);
  assert.ok(start>=0&&end>start&&a>=0&&b>a);
  const actual=live.slice(a,b);
  assert.match(actual,/labConversationContext\.remember\(/);
  assert.match(actual,/\)===true;/);
  assert.match(actual,/retainEncryptedInput:!contextPersisted/);
  assert.doesNotMatch(actual,/sendTextInCurrentLab|labTestReplyJournal\.confirm/);
  const callback=vm.runInNewContext(
    '(async({plan,labConversationContext,finalizeConfirmedVisibleLabQuote,log,row,body})=>{'+
    actual+'return contextPersisted;})'
  );
  for(const [returned,expected] of [
    [true,false],[false,true],[undefined,true],[null,true],
    [1,true],['true',true]
  ]){
    const flags=[];let calls=0;
    const persisted=await callback({
      plan:{rememberRace:true,sender,raceNumber:5,raceScope:race,
        raceTrack:race.racetrack,raceDate:race.raceDate},
      labConversationContext:{remember:async()=>{calls++;return returned;}},
      finalizeConfirmedVisibleLabQuote:async(_row,_body,options)=>
        flags.push(options.retainEncryptedInput),
      log:async()=>{},row:msg,body:msg.text
    });
    assert.equal(persisted,!expected,'persisted status for '+String(returned));
    assert.equal(calls,1);
    assert.deepEqual(flags,[expected],'input retention for '+String(returned));
  }
});

test('visible LAB ACK preserves original if context storage throws or is absent',async()=>{
  const live=bridge.slice(bridge.indexOf('async function processLabTestInput()'),
    bridge.indexOf('async function visibleLabHasTag(tag)'));
  const a=live.indexOf('let contextPersisted=!plan.rememberRace;');
  const b=live.indexOf('processed += 1;',a);
  const callback=vm.runInNewContext(
    '(async({plan,labConversationContext,finalizeConfirmedVisibleLabQuote,log,row,body})=>{'+
    live.slice(a,b)+'return contextPersisted;})'
  );
  for(const context of [
    {remember:async()=>{throw new Error('disk-full');}},
    null
  ]){
    const flags=[],logs=[];
    const result=await callback({
      plan:{rememberRace:true,sender,raceNumber:5,raceScope:race,
        raceTrack:race.racetrack,raceDate:race.raceDate},
      labConversationContext:context,
      finalizeConfirmedVisibleLabQuote:async(_row,_body,options)=>
        flags.push(options.retainEncryptedInput),
      log:async value=>logs.push(value),row:msg,body:msg.text
    });
    assert.equal(result,false);
    assert.deepEqual(flags,[true]);
    if(context)assert.deepEqual(logs,['LAB_CONTEXT_PERSIST_FAILED']);
  }
  const flags=[];
  assert.equal(await callback({
    plan:{rememberRace:false},labConversationContext:null,
    finalizeConfirmedVisibleLabQuote:async(_row,_body,options)=>
      flags.push(options.retainEncryptedInput),
    log:async()=>{},row:msg,body:msg.text
  }),true);
  assert.deepEqual(flags,[false],'a reply with no race to remember is unaffected');
});
