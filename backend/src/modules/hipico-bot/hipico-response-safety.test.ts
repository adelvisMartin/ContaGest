import assert from 'node:assert/strict';
import test from 'node:test';
import { decideConversation } from './hipico-conversation-engine.js';
import { applyOperatorCommand, initialHandoffState, planSafeResponse, recoverExpiredHandoff, responseIdempotencyKey, updateHandoffAfterDecision } from './hipico-response-safety.js';
import type { IntentResult } from './hipico-operational-classifier.js';

const message={sourceMessageId:'m-152',participantId:'p1',text:'hola',timestamp:'2026-08-29T12:00:00.000Z',raceId:'1'};
const classifier=(result:Partial<IntentResult>)=>()=>({intent:'greeting',risk:'safe',confidence:1,suggestion:'Hola.',autoEligible:false,reason:'TEST',...result} as IntentResult);

test('CONFIRMED is impossible without decision-bound persisted evidence',()=>{
  const decision=decideConversation(message,{},classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N',horse:'4',amount:100}}));
  const withoutEvidence=planSafeResponse(decision);
  assert.notEqual(withoutEvidence.intent,'CONFIRMED');
  assert.equal(withoutEvidence.confirmationVerified,false);
  const unbound=planSafeResponse(decision,{evidence:{persisted:true,receiptId:'receipt-123'}});
  assert.notEqual(unbound.intent,'CONFIRMED');
  assert.equal(unbound.reason,'PERSISTENCE_EVIDENCE_NOT_BOUND_TO_DECISION');
  const wrongSource=planSafeResponse(decision,{evidence:{persisted:true,receiptId:'receipt-123',sourceMessageId:'other',correlationId:decision.correlationId}});
  assert.notEqual(wrongSource.intent,'CONFIRMED');
  const withEvidence=planSafeResponse(decision,{evidence:{persisted:true,receiptId:'receipt-123',sourceMessageId:decision.sourceMessageId,correlationId:decision.correlationId}});
  assert.equal(withEvidence.intent,'CONFIRMED');
  assert.equal(withEvidence.confirmationVerified,true);
  assert.match(withEvidence.text||'',/receipt-123/);
});

test('DB/backend degradation never emits false confirmation',()=>{
  const decision=decideConversation(message);
  const plan=planSafeResponse(decision,{systemHealthy:false,evidence:{persisted:true,receiptId:'should-not-win',sourceMessageId:decision.sourceMessageId,correlationId:decision.correlationId}});
  assert.equal(plan.intent,'SYSTEM_DEGRADED');
  assert.equal(plan.confirmationVerified,false);
  assert.equal(plan.handoffRequired,false,'technical degradation alone must not transfer conversation ownership');
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

test('invalid handoff TTL is rejected instead of becoming an accidental indefinite takeover',()=>{
  const initial=initialHandoffState('group-a','p1','1');
  assert.throws(
    ()=>applyOperatorCommand(initial,'pause',{authenticatedOperator:true,operatorId:'operator-1',ttlMs:Number.NaN}),
    (error:any)=>error?.code==='HIPICO_HANDOFF_TTL_INVALID'
  );
  assert.throws(
    ()=>applyOperatorCommand(initial,'escalate',{authenticatedOperator:true,operatorId:'operator-1',ttlMs:-1}),
    (error:any)=>error?.code==='HIPICO_HANDOFF_TTL_INVALID'
  );
});

test('malformed persisted handoff expiry fails closed and keeps the human owner',()=>{
  const initial=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const human={...applyOperatorCommand(initial,'pause',{authenticatedOperator:true,operatorId:'operator-1',at:'2026-08-29T12:00:00.000Z',ttlMs:60_000}),expiresAt:'corrupted-expiry'};
  const decision=decideConversation(message);
  const plan=planSafeResponse(decision,{handoffState:human,at:'2026-08-29T12:30:00.000Z'});
  assert.equal(plan.intent,'NONE');
  assert.equal(plan.canSend,false);
  assert.equal(plan.handoffRequired,true);
  assert.equal(plan.reason,'HUMAN_OWNS_CONVERSATION');
});

test('three autonomous clarifications are attempted before human ownership becomes the last fallback',()=>{
  let state=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const ambiguous=decideConversation({...message,text:'juega 2N'}, {}, classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N'}}));

  state=updateHandoffAfterDecision(state,ambiguous,'2026-08-29T12:00:01.000Z');
  assert.equal(state.ownership,'bot');
  assert.equal(state.clarificationCount,1);
  assert.equal(planSafeResponse(ambiguous,{handoffState:state,at:'2026-08-29T12:00:01.000Z'}).intent,'NEEDS_CLARIFICATION');

  state=updateHandoffAfterDecision(state,ambiguous,'2026-08-29T12:00:02.000Z');
  assert.equal(state.ownership,'bot');
  assert.equal(state.clarificationCount,2);
  assert.equal(planSafeResponse(ambiguous,{handoffState:state,at:'2026-08-29T12:00:02.000Z'}).intent,'NEEDS_CLARIFICATION');

  state=updateHandoffAfterDecision(state,ambiguous,'2026-08-29T12:00:03.000Z');
  assert.equal(state.ownership,'human');
  assert.equal(state.clarificationCount,3);
  assert.equal(state.reason,'max-clarifications-reached');
  assert.ok(state.expiresAt);
  const finalPlan=planSafeResponse(ambiguous,{handoffState:state,at:'2026-08-29T12:00:03.000Z'});
  assert.equal(finalPlan.intent,'ESCALATED');
  assert.equal(finalPlan.canSend,true);
  assert.equal(finalPlan.handoffRequired,true);
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
  const sameIdentity={sourceMessageId:decision.sourceMessageId,policyVersion:decision.policyVersion};
  assert.equal(responseIdempotencyKey(decision),responseIdempotencyKey(sameIdentity));
  assert.match(responseIdempotencyKey(decision),/^resp_[a-f0-9]{32}$/);
});

test('handoff conversation key is isolated by group and race',()=>{
  const a=initialHandoffState('group-a','p1','1');
  const b=initialHandoffState('group-b','p1','1');
  const c=initialHandoffState('group-a','p1','2');
  assert.notEqual(a.conversationKey,b.conversationKey);
  assert.notEqual(a.conversationKey,c.conversationKey);
});


test('unattended max-clarification handoff auto-releases and resets clarification budget',()=>{
  let state=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const ambiguous=decideConversation({...message,text:'juega 2N'}, {}, classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N'}}));
  for(const at of ['2026-08-29T12:00:01.000Z','2026-08-29T12:00:02.000Z','2026-08-29T12:00:03.000Z']){
    state=updateHandoffAfterDecision(state,ambiguous,at);
  }
  assert.equal(state.ownership,'human');
  const recovered=recoverExpiredHandoff(state,'2026-08-29T12:15:04.000Z');
  assert.equal(recovered.ownership,'bot');
  assert.equal(recovered.clarificationCount,0);
  assert.equal(recovered.reason,'handoff-timeout-released');
});


test('system degradation preserves last-resort handoff after the clarification budget is exhausted',()=>{
  let state=initialHandoffState('group-a','p1','1','2026-08-29T12:00:00.000Z');
  const ambiguous=decideConversation({...message,text:'juega 2N'}, {}, classifier({intent:'offer_player',risk:'monetary',confidence:.99,entities:{play:'2N'}}));
  for(const at of ['2026-08-29T12:00:01.000Z','2026-08-29T12:00:02.000Z','2026-08-29T12:00:03.000Z']){
    state=updateHandoffAfterDecision(state,ambiguous,at);
  }
  const plan=planSafeResponse(ambiguous,{
    handoffState:state,
    systemHealthy:false,
    at:'2026-08-29T12:00:03.000Z'
  });
  assert.equal(plan.intent,'SYSTEM_DEGRADED');
  assert.equal(plan.canSend,true);
  assert.equal(plan.handoffRequired,true);
  assert.match(plan.text||'',/no se confirmó/i);
});
