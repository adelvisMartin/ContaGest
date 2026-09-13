import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_META_FUTURE_SKEW_MS, metaTimestampValid, normalizeMetaTimestamp } from './hipico-meta-timestamp-policy.js';
import { __test__ as webhookTest } from './hipico-webhook.routes.js';

test('backend Meta timestamp policy accepts bounded Unix seconds and rejects malformed/future evidence',()=>{
  const now=Date.parse('2026-09-12T02:00:00.000Z');
  const historical=Math.floor(Date.parse('2025-01-02T03:04:05.000Z')/1000);
  assert.equal(normalizeMetaTimestamp(String(historical),now),'2025-01-02T03:04:05.000Z');
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)),now),true);
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)+1),now),false);
  for(const value of ['',null,undefined,'-1','1.5','1e9','not-a-number']){
    assert.equal(metaTimestampValid(value,now),false,String(value));
  }
});

test('backend webhook timestamp guard reads immutable provider payload timestamp',()=>{
  const current=String(Math.floor(Date.now()/1000));
  assert.equal(webhookTest.webhookTimestampValid({payload:{timestamp:current}}),true);
  assert.equal(webhookTest.webhookTimestampValid({payload:{timestamp:'999999999999'}}),false);
  assert.equal(webhookTest.webhookTimestampValid({payload:{}}),false);
});
