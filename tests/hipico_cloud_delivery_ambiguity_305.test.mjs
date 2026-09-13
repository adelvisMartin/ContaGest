import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ as senderTest } from '../frontend/api/hipico/whatsapp-send.js';

test('#305 Cloud sender never auto-retries transport-ambiguous HTTP responses',()=>{
  assert.equal(senderTest.providerHttpDisposition(408,1),'reconciliation_required');
  assert.equal(senderTest.providerHttpDisposition(500,1),'reconciliation_required');
  assert.equal(senderTest.providerHttpDisposition(502,5),'reconciliation_required');
  assert.equal(senderTest.providerHttpDisposition(599,1),'reconciliation_required');
});

test('#305 only explicit rate limiting is auto-retried and the retry budget stays bounded',()=>{
  assert.equal(senderTest.providerHttpDisposition(429,1),'retry');
  assert.equal(senderTest.providerHttpDisposition(429,5),'retry');
  assert.equal(senderTest.providerHttpDisposition(429,6),'failed');
  assert.equal(senderTest.providerHttpDisposition(400,1),'failed');
  assert.equal(senderTest.providerHttpDisposition(401,1),'failed');
});
