import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route=readFileSync(new URL('../hipico-bot/hipico-bridge.routes.ts',import.meta.url),'utf8');

test('bridge computes autonomous decision after response safety and before persistence',()=>{
  const plan=route.indexOf('planSafeResponse(');
  const arbitrate=route.indexOf('arbitrateAutonomousConversation({',plan);
  const exactPlan=route.indexOf('const autonomousResponsePlan={',arbitrate);
  const persist=route.indexOf('persistResponsePlan(autonomousResponsePlan)',exactPlan);
  assert.ok(plan>=0&&arbitrate>plan&&exactPlan>arbitrate&&persist>exactPlan);
});

test('bridge persists exactly the arbiter-selected text and decision version',()=>{
  assert.match(route,/text:autonomousDecision\.canSend\?autonomousDecision\.text:null/);
  assert.match(route,/canSend:autonomousDecision\.canSend/);
  assert.match(route,/handoffRequired:autonomousDecision\.humanRequired/);
  assert.match(route,/decisionVersion:[\s\S]{0,120}autonomousDecision\.policyVersion/);
  assert.match(route,/replyId:autonomousResponsePlan\.responseIdempotencyKey/);
});

test('bridge never exposes domain authority through autonomous reply payload',()=>{
  assert.match(route,/humanIsLastResort:true/);
  assert.match(route,/directEffectsAllowed:false/);
  assert.match(route,/financialAuthority:false/);
  assert.match(route,/actions:\[\] as never\[\]/);
});

test('Jev observation remains best-effort evidence around deterministic conversation flow',()=>{
  assert.match(route,/observeAutonomousProvider/);
  assert.match(route,/providerObservation:providerEvidence\.observation/);
  assert.match(route,/providerReadiness:providerEvidence\.readiness/);
  assert.doesNotMatch(route,/canAct.*providerEvidence/);
  assert.doesNotMatch(route,/riskPolicy.*providerEvidence/);
});
