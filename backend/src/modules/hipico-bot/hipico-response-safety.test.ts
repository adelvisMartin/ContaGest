import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation } from './hipico-conversation-engine.js';
import { applyOperatorCommand, initialHandoffState, planSafeResponse, responseIdempotencyKey, updateHandoffAfterDecision } from './hipico-response-safety.js';
import type { IntentResult } from './hipico-operational-classifier.js';

const message={sourceMessageId:'m-152',participantId:'p1',text:'hola',timestamp:'2026-08-29T12:00:00.000Z',raceId:'1'};
const classifier=(result:Partial<IntentResult>)=>()=>({intent:'greeting',risk:'safe',confidence:1,suggestion:'Hola.',autoEligible:false,reason:'TEST',...result} as IntentResult);

test('CONFIRMED is impossible without persisted receipt/transaction/state evidence',()=>{
  const decision=decideConversation(message,{},classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N',horse:'4',amount:100}}));
  const withoutEvidence=planSafeResponse(decision);
  assert.notEqual(withoutEvidence.intent,'CONFIRMED');
  assert.equal(withoutEvidence.confirmationVerified,false);
  const withEvidence=planSafeResponse(decision,{evidence:{persisted:true,receiptId:'receipt-123'}});
  assert.equal(withEvidence.intent,'CONFIRMED');
  assert.equal(withEvidence.confirmationVerified,true);
  assert.match(withEvidence.text||'',/receipt-123/);
});

test('DB/backend degradation never emits false confirmation',()=>{
  const decision=decideConversation(message);
  const plan=planSafeResponse(decision,{systemHealthy:false,evidence:{persisted:true,receiptId:'should-not-win'}});
  assert.equal(plan.intent,'SYSTEM_DEGRADED');
  assert.equal(plan.confirmationVerified,false);
  assert.match(plan.text||'',/no se confirmó/i);
});

test('human takeover silences automated response',()=>{
  const initial=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const human=applyOperatorCommand(initial,'pause',{authenticatedOperator:true,operatorId:'operator-1',at:'2026-08-29T12:00:00.000Z',ttlMs:60_000});
  const decision=decideConversation(message);
  const plan=planSafeResponse(decision,{handoffState:human,at:'2026-08-29T12:00:30.000Z'});
  assert.equal(plan.intent,'NONE');
  assert.equal(plan.canSend,false);
  assert.equal(plan.handoffRequired,true);
});

test('operator commands cannot be authenticated by free text',()=>{
  const initial=initialHandoffState('group-a','p1','1');
  assert.throws(()=>applyOperatorCommand(initial,'pause',{authenticatedOperator:false,operatorId:'ADMIN: pause'}),/no autenticado/i);
});

test('second clarification escalates to human ownership',()=>{
  let state=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const ambiguous=decideConversation({...message,text:'juega 2N'}, {}, classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N'}}));
  state=updateHandoffAfterDecision(state,ambiguous,'2026-08-29T12:00:01.000Z');
  assert.equal(state.ownership,'bot');
  const beforeSecond=planSafeResponse(ambiguous,{handoffState:state,at:'2026-08-29T12:00:02.000Z'});
  assert.equal(beforeSecond.intent,'ESCALATED');
  state=updateHandoffAfterDecision(state,ambiguous,'2026-08-29T12:00:02.000Z');
  assert.equal(state.ownership,'human');
  assert.equal(state.reason,'max-clarifications-reached');
});

test('handoff timeout releases ownership but does not invent a monetary confirmation',()=>{
  const initial=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const human=applyOperatorCommand(initial,'pause',{authenticatedOperator:true,operatorId:'op',at:'2026-08-29T12:00:00.000Z',ttlMs:1000});
  const decision=decideConversation(message,{},classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N',horse:'4',amount:100}}));
  const plan=planSafeResponse(decision,{handoffState:human,at:'2026-08-29T12:00:02.000Z'});
  assert.notEqual(plan.intent,'CONFIRMED');
  assert.equal(plan.confirmationVerified,false);
});

test('response idempotency key is stable for source message + decision policy',()=>{
  const decision=decideConversation(message);
  assert.equal(responseIdempotencyKey(decision),responseIdempotencyKey({...decision,responseText:'other'}));
  assert.match(responseIdempotencyKey(decision),/^resp_[a-f0-9]{32}$/);
});

test('handoff conversation key is isolated by group and race',()=>{
  const a=initialHandoffState('group-a','p1','1');
  const b=initialHandoffState('group-b','p1','1');
  const c=initialHandoffState('group-a','p1','2');
  assert.notEqual(a.conversationKey,b.conversationKey);
  assert.notEqual(a.conversationKey,c.conversationKey);
});
