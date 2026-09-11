import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORY_MAX_IDENTICAL_PER_MINUTE, historySyncRateCheck, historySyncRateLimiter, liveRateLimitClock, normalizeBridgeSender } from './hipico-bridge-input-policy.js';

test('bridge sender normalization rejects empty canonical identities',()=>{
  assert.equal(normalizeBridgeSender(''),null);
  assert.equal(normalizeBridgeSender('@c.us'),null);
  assert.equal(normalizeBridgeSender('   @lid   '),null);
});

test('bridge sender normalization preserves a stable sender identity without transport suffix',()=>{
  assert.equal(normalizeBridgeSender('584121234567@c.us'),'584121234567');
  assert.equal(normalizeBridgeSender('participant-7@lid'),'participant-7');
});

test('bridge sender normalization rejects control characters',()=>{
  assert.equal(normalizeBridgeSender('participant\u0007@c.us'),null);
});

test('live rate limiting uses server time and never the message timestamp',()=>{
  assert.equal(liveRateLimitClock(false,()=>123456),123456);
  assert.equal(liveRateLimitClock(true,()=>123456),null);
});

test('history replay has a separate larger server-side throttle but is never unlimited',()=>{
  historySyncRateLimiter.reset();
  const actor='source:p1';
  const digest='same';
  for(let index=0;index<HISTORY_MAX_IDENTICAL_PER_MINUTE;index+=1){
    assert.equal(historySyncRateCheck(actor,digest,1000+index).allowed,true);
  }
  const blocked=historySyncRateCheck(actor,digest,2000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'REPETITION_RATE_LIMIT');
  assert.equal(historySyncRateCheck('source:p2',digest,2000).allowed,true);
  historySyncRateLimiter.reset();
});
