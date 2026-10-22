import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyLabResponseRecovery,LAB_RECOVERY_WINDOW_MS} from './hipico-lab-response-recovery.js';

const now=Date.parse('2026-10-12T15:00:00.000Z');
const key='resp_'+('a'.repeat(32));
const msg='m-42',text='Mensaje recibido. Sin operaciones.';
const digest=crypto.createHash('sha256').update(text).digest('hex');

function candidate(overrides:Record<string,unknown>={}){
  return {
    intent:'ACK_RECEIVED',text,canSend:true,confirmationVerified:false,evidence:null,
    responseIdempotencyKey:key,decisionVersion:'hipico-conversation-v3+hipico-response-v3',
    correlationId:'conv_0123456789abcdef01234567',sourceMessageId:msg,
    handoffRequired:false,reason:'SAFE_ACK',...overrides
  } as any;
}
function receipt(overrides:Record<string,unknown>={}){
  return {
    id:'00000000-0000-4000-8000-000000000001',
    idempotencyKey:key,sourceMessageId:msg,
    decisionVersion:'hipico-conversation-v3+hipico-response-v3',
    correlationId:'conv_0123456789abcdef01234567',
    intent:'ACK_RECEIVED',responseHash:digest,receiptId:null,transactionId:null,
    stateId:null,confirmationVerified:false,status:'planned',...overrides
  } as any;
}
function params(overrides:Record<string,unknown>={}){
  return {
    channelRole:'lab',duplicate:true,historySync:false,fromMe:false,
    mediaKind:'none',forceReview:false,rateAllowed:true,systemHealthy:true,
    timestamp:new Date(now-1000).toISOString(),nowMs:now,
    currentHandoff:null,classification:{intent:'help',risk:'safe'},
    candidate:candidate(),receipt:receipt(),...overrides
  } as any;
}

test('lost HTTP after commit recovers only an identical immutable typed receipt',()=>{
  const recovered=verifyLabResponseRecovery(params());
  assert.equal(recovered.recovered,true);
  if(recovered.recovered){
    assert.equal(recovered.plan.text,text);
    assert.equal(recovered.reason,'LAB_RESPONSE_RECOVERED');
  }
});

test('no row and different response, policy, source, correlation or intent fail closed',()=>{
  const cases=[
    {receipt:null},
    {receipt:receipt({responseHash:crypto.createHash('sha256').update('old text').digest('hex')})},
    {receipt:receipt({decisionVersion:'stale-policy-v1'})},
    {receipt:receipt({sourceMessageId:'different-id'})},
    {receipt:receipt({correlationId:'other'})},
    {receipt:receipt({intent:'CONFIRMED'})},
    {receipt:receipt({status:'held'})},
    {receipt:receipt({stateId:'state-mutated'})},
    {receipt:receipt({confirmationVerified:true})},
    {candidate:candidate({text:'changed canonical result'})},
    {candidate:candidate({responseIdempotencyKey:'resp_'+('b'.repeat(32))})}
  ];
  for(const alteration of cases){
    assert.equal(verifyLabResponseRecovery(params(alteration)).recovered,false,JSON.stringify(alteration));
  }
});

test('human takeover, monetary ambiguity, results and non-LAB channels never recover',()=>{
  const cases=[
    {currentHandoff:{ownership:'human'}},
    {classification:{intent:'offer_player',risk:'monetary'}},
    {classification:{intent:'race_result',risk:'review'}},
    {classification:{intent:'conversation',risk:'review'}},
    {channelRole:'source'},
    {historySync:true},{fromMe:true},{mediaKind:'image'},
    {forceReview:true},{rateAllowed:false},{systemHealthy:false},
    {candidate:candidate({handoffRequired:true})},
    {candidate:candidate({intent:'CONFIRMED'})},
    {candidate:candidate({confirmationVerified:true})}
  ];
  for(const alteration of cases)assert.equal(verifyLabResponseRecovery(params(alteration)).recovered,false);
});

test('freshness window prevents stale static text replay after long outage',()=>{
  assert.equal(verifyLabResponseRecovery(params({timestamp:new Date(now-LAB_RECOVERY_WINDOW_MS).toISOString()})).recovered,true);
  assert.equal(verifyLabResponseRecovery(params({timestamp:new Date(now-LAB_RECOVERY_WINDOW_MS-1).toISOString()})).reason,'LAB_RECOVERY_STALE');
  assert.equal(verifyLabResponseRecovery(params({timestamp:new Date(now+1000).toISOString()})).recovered,false);
  assert.equal(verifyLabResponseRecovery(params({timestamp:'invalid'})).recovered,false);
});

test('typed receipt recovery has no database writes and is gated after backend event replay protection',async()=>{
  const {readFileSync}=await import('node:fs');
  const route=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const store=readFileSync(new URL('./hipico-handoff.store.ts',import.meta.url),'utf8');
  const start=route.indexOf("if(input.channelRole==='lab'&&!event.inserted&&!input.historySync)");
  // Keep the LAB immutable receipt boundary isolated from SOURCE auto-send.
  // The server now enforces a reviewed NO_GO gate rather than a bare flag.
  const end=route.indexOf('const autoReplyConfigured=sourceAutoReplySendAuthorized();',start);
  assert.ok(start>0&&end>start);
  const block=route.slice(start,end);
  assert.match(block,/readResponseReceiptForRecovery\(/);
  assert.match(block,/verifyLabResponseRecovery\(/);
  assert.match(block,/canSend:false,text:null/);
  assert.doesNotMatch(block,/persistResponsePlan\(|persistBridgeTransportEvent\(|sendCloudText/);
  const readStart=store.indexOf('export async function readResponseReceiptForRecovery');
  const readEnd=store.indexOf('export async function persistResponsePlan',readStart);
  const readOnly=store.slice(readStart,readEnd);
  assert.match(readOnly,/SELECT "id","idempotencyKey"/);
  assert.doesNotMatch(readOnly,/INSERT|UPDATE|DELETE/i);
});
