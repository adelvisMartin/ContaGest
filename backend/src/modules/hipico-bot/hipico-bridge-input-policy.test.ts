import assert from 'node:assert/strict';
import test from 'node:test';
import { historySyncRateCheck, liveRateLimitClock, normalizeBridgeSender } from './hipico-bridge-input-policy.js';

test('bridge sender normalization rejects empty canonical identities',()=>{
  assert.equal(normalizeBridgeSender(''),null);
  assert.equal(normalizeBridgeSender('@c.us'),null);
  assert.equal(normalizeBridgeSender('   @lid   '),null);
});

test('bridge sender normalization preserves a stable sender identity without transport suffix',()=>{
  assert.equal(normalizeBridgeSender('584121234567@c.us'),'584121234567');
  assert.equal(normalizeBridgeSender('participant-7@lid'),'participant-7');
});

test('live rate limiting uses server time and never the message timestamp',()=>{
  assert.equal(liveRateLimitClock(false,()=>123456),123456);
  assert.equal(liveRateLimitClock(true,()=>123456),null);
});

test('history replay is explicitly exempt from live participant throttling',()=>{
  assert.deepEqual(historySyncRateCheck(),{allowed:true,reason:null,count:0,identicalCount:0,retryAfterMs:0});
});
