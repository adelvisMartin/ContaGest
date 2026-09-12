import test from 'node:test';
import assert from 'node:assert/strict';
import { retryAfterMs } from '../frontend/api/hipico/_shared.js';
import { __test__ } from '../frontend/api/hipico/whatsapp-send.js';

const NOW = Date.parse('2026-09-11T12:00:00.000Z');

test('Retry-After numeric seconds are parsed and bounded',()=>{
  assert.equal(retryAfterMs('15',NOW),15000);
  assert.equal(retryAfterMs('0.5',NOW),500);
  assert.equal(retryAfterMs('999999999',NOW),24*60*60*1000);
  assert.equal(retryAfterMs('garbage',NOW),0);
});

test('Retry-After HTTP-date uses the same deterministic instant and ignores past dates',()=>{
  assert.equal(retryAfterMs('Fri, 11 Sep 2026 12:05:00 GMT',NOW),5*60*1000);
  assert.equal(retryAfterMs('Fri, 11 Sep 2026 11:59:00 GMT',NOW),0);
});

test('Meta sender never retries earlier than its local exponential backoff',()=>{
  assert.equal(
    __test__.nextRetryIso(1,'15',NOW),
    new Date(NOW+2*60*1000).toISOString()
  );
});

test('Meta sender honors a longer provider Retry-After',()=>{
  assert.equal(
    __test__.nextRetryIso(1,'600',NOW),
    new Date(NOW+10*60*1000).toISOString()
  );
});
