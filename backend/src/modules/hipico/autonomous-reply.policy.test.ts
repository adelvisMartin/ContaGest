import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JEV_DOWNGRADE_THRESHOLDS,
  providerRequiresSafetyDowngrade,
  safeConversationalIntent,
  safeQueryIntent,
  sourceAutoReplyEnabled
} from './autonomous-reply.policy.js';

const readiness={
  eligibleForAssistedRanking:true,
  authoritative:false as const,
  reason:'PROVIDER_SHADOW_GATE_PASSED',
  gateVersion:'jev-shadow-readiness-v1',
  historical:{intentClassAccuracy:1,availabilityRate:1,safetyDisagreementRate:0},
  recent:{intentClassAccuracy:1,availabilityRate:1,safetyDisagreementRate:0},
  thresholds:{
    historicalReviewedObserved:200,
    recentReviewedObserved:75,
    intentClassAccuracy:.98,
    availabilityRate:.99,
    safetyDisagreements:0 as const
  }
};

function observation(overrides:Record<string,unknown>={}){
  return{
    providerId:'typesafe-jev',
    mode:'SHADOW',
    status:'OBSERVED',
    authoritative:false,
    canAuthorize:false,
    model:'jev-test',
    latencyMs:1,
    failureCode:null,
    decision:{
      intentClass:'query_next_race',
      intentConfidence:.99,
      intentProbabilities:{query_next_race:.99,unknown:.01},
      humanReviewProbability:.01,
      candidateAgreementProbability:.99,
      ...overrides
    },
    usage:{inputUnits:10,outputUnits:2}
  } as any;
}

test('autonomous source replies remain explicit opt-in',()=>{
  assert.equal(sourceAutoReplyEnabled({}),false);
  assert.equal(sourceAutoReplyEnabled({HIPICO_SOURCE_AUTO_REPLY_ENABLED:'TRUE'}),true);
});

test('intent helpers keep autonomous scope intentionally narrow',()=>{
  assert.equal(safeConversationalIntent('greeting'),true);
  assert.equal(safeConversationalIntent('help'),true);
  assert.equal(safeConversationalIntent('status_non_monetary'),true);
  assert.equal(safeConversationalIntent('betting_or_balance'),false);
  assert.equal(safeQueryIntent('query:NEXT_RACE'),true);
  assert.equal(safeQueryIntent('race_close'),false);
});

test('weak provider disagreement never downgrades a deterministic safe reply',()=>{
  assert.equal(providerRequiresSafetyDowngrade(
    'query:NEXT_RACE',
    observation({
      intentClass:'query_last_result',
      intentConfidence:JEV_DOWNGRADE_THRESHOLDS.intentConflictConfidence-.01,
      humanReviewProbability:JEV_DOWNGRADE_THRESHOLDS.humanReviewProbability-.01,
      candidateAgreementProbability:JEV_DOWNGRADE_THRESHOLDS.candidateAgreementProbability+.01
    }),
    readiness
  ),false);
});

test('each strong Jev safety signal can downgrade but never authorize',()=>{
  assert.equal(providerRequiresSafetyDowngrade(
    'query:NEXT_RACE',
    observation({
      intentClass:'query_last_result',
      intentConfidence:JEV_DOWNGRADE_THRESHOLDS.intentConflictConfidence
    }),
    readiness
  ),true);
  assert.equal(providerRequiresSafetyDowngrade(
    'query:NEXT_RACE',
    observation({
      humanReviewProbability:JEV_DOWNGRADE_THRESHOLDS.humanReviewProbability
    }),
    readiness
  ),true);
  assert.equal(providerRequiresSafetyDowngrade(
    'query:NEXT_RACE',
    observation({
      candidateAgreementProbability:JEV_DOWNGRADE_THRESHOLDS.candidateAgreementProbability
    }),
    readiness
  ),true);
});

test('provider cannot influence autonomy before readiness gate passes',()=>{
  assert.equal(providerRequiresSafetyDowngrade(
    'query:NEXT_RACE',
    observation({
      intentClass:'monetary',
      intentConfidence:1,
      humanReviewProbability:1,
      candidateAgreementProbability:0
    }),
    {...readiness,eligibleForAssistedRanking:false}
  ),false);
});
