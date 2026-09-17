import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMOTION_STAGES,
  REQUIRED_RELEASE_GATES,
  buildReleaseManifest,
  validatePromotionTransition
} from '../scripts/hipico-release-manifest-v12.mjs';

const SHA='a'.repeat(40);
const passing=()=>REQUIRED_RELEASE_GATES.map((id)=>({id,status:'PASS',evidenceSha:SHA}));

test('v12 promotion order is strict and rollback to SHADOW is always allowed',()=>{
  assert.deepEqual(PROMOTION_STAGES,['SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC']);
  assert.equal(validatePromotionTransition('SHADOW','ASSISTED'),true);
  assert.equal(validatePromotionTransition('ASSISTED','AUTOMATIC_LOW_RISK'),true);
  assert.equal(validatePromotionTransition('AUTOMATIC_LOW_RISK','AUTOMATIC'),true);
  assert.equal(validatePromotionTransition('SHADOW','AUTOMATIC'),false);
  assert.equal(validatePromotionTransition('AUTOMATIC','SHADOW'),true);
});

test('release is eligible only when every required gate PASSes for the frozen candidate',()=>{
  const manifest=buildReleaseManifest({candidateSha:SHA,gates:passing()});
  assert.equal(manifest.releaseEligible,true);
  assert.equal(manifest.invariants.sourceReadOnly,true);
  assert.equal(manifest.invariants.labWriteOnlyDuringQa,true);
  assert.equal(manifest.invariants.financialAuthority,false);
  assert.equal(manifest.rollback.killSwitchTarget,'SHADOW');
});

test('BLOCKED, NOT_EXECUTED, FAIL or mismatched SHA block release',()=>{
  for(const status of ['BLOCKED','NOT_EXECUTED','FAIL']){
    const gates=passing(); gates[0]={...gates[0],status};
    assert.equal(buildReleaseManifest({candidateSha:SHA,gates}).releaseEligible,false,status);
  }
  const mismatched=passing(); mismatched[0]={...mismatched[0],evidenceSha:'b'.repeat(40)};
  assert.equal(buildReleaseManifest({candidateSha:SHA,gates:mismatched}).releaseEligible,false);
});

test('manifest signature is reproducible regardless of input gate order',()=>{
  const a=buildReleaseManifest({candidateSha:SHA,gates:passing()});
  const b=buildReleaseManifest({candidateSha:SHA,gates:[...passing()].reverse()});
  assert.equal(a.signature,b.signature);
});
