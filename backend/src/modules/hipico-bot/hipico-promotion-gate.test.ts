import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePromotion, productionCapabilityEnabled } from './hipico-promotion-gate.js';

const SHA='a'.repeat(40);
const green={
  candidateSha:SHA,
  physicalQa119:'PASS' as const,
  soak120:'PASS' as const,
  security114:'PASS' as const,
  conversationAppsec153:'PASS' as const,
  whatsappCompliance154:'GO' as const,
  approval:{approved:true,actor:'release-owner',reason:'candidate verified',at:'2026-08-30T10:00:00.000Z'}
};

test('fresh install/default shadow never writes source, outbound or money',()=>{
  const decision=evaluatePromotion('shadow',{...green,approval:null});
  assert.equal(decision.allowed,true);
  assert.equal(decision.effectiveMode,'shadow');
  assert.equal(decision.sourceWrite,false);
  assert.equal(decision.authorizedOutboundWrite,false);
  assert.equal(decision.monetaryWrite,false);
});

test('production fails closed when WhatsApp compliance is NO_GO',()=>{
  const decision=evaluatePromotion('production',{...green,whatsappCompliance154:'NO_GO'});
  assert.equal(decision.allowed,false);
  assert.equal(decision.effectiveMode,'shadow');
  assert.equal(decision.sourceWrite,false);
  assert.equal(decision.authorizedOutboundWrite,false);
  assert.match(decision.reasons.join(','),/WHATSAPP_COMPLIANCE_NOT_GO/);
});

test('missing physical/soak evidence blocks promotion',()=>{
  const decision=evaluatePromotion('assisted',{...green,physicalQa119:'NOT_EXECUTED',soak120:'BLOCKED'});
  assert.equal(decision.allowed,false);
  assert.equal(decision.effectiveMode,'shadow');
  assert.equal(decision.sourceWrite,false);
});

test('approval requires actor and reason',()=>{
  const decision=evaluatePromotion('assisted',{...green,approval:{approved:true,actor:'',reason:'',at:null}});
  assert.equal(decision.allowed,false);
  assert.match(decision.reasons.join(','),/EXPLICIT_APPROVAL_MISSING/);
});

test('local kill switch forces safe shadow regardless of green evidence',()=>{
  const decision=evaluatePromotion('production',green,true);
  assert.equal(decision.allowed,false);
  assert.equal(decision.effectiveMode,'shadow');
  assert.equal(decision.sourceWrite,false);
  assert.equal(decision.authorizedOutboundWrite,false);
  assert.equal(productionCapabilityEnabled(decision),false);
});

test('green production can unlock only separately authorized outbound, never SOURCE or money',()=>{
  const decision=evaluatePromotion('production',green,false);
  assert.equal(decision.allowed,true);
  assert.equal(decision.sourceWrite,false);
  assert.equal(decision.authorizedOutboundWrite,true);
  assert.equal(decision.monetaryWrite,false);
  assert.equal(productionCapabilityEnabled(decision),true);
});

test('assisted mode remains operator-driven and does not unlock automatic outbound',()=>{
  const decision=evaluatePromotion('assisted',green,false);
  assert.equal(decision.allowed,true);
  assert.equal(decision.effectiveMode,'assisted');
  assert.equal(decision.sourceWrite,false);
  assert.equal(decision.authorizedOutboundWrite,false);
  assert.equal(decision.monetaryWrite,false);
  assert.equal(productionCapabilityEnabled(decision),false);
});
