import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ as senderTest } from '../frontend/api/hipico/whatsapp-send.js';

test('#305 serverless Cloud timeout shares canonical bounded semantics',()=>{
  assert.equal(senderTest.sendTimeoutMs({}),12000);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_CLOUD_SEND_TIMEOUT_MS:'2500'}),2500);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_CLOUD_SEND_TIMEOUT_MS:'0'}),12000);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_CLOUD_SEND_TIMEOUT_MS:'not-a-number'}),12000);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_CLOUD_SEND_TIMEOUT_MS:'999999'}),60000);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_META_SEND_TIMEOUT_MS:'3500'}),3500);
  assert.equal(senderTest.sendTimeoutMs({HIPICO_CLOUD_SEND_TIMEOUT_MS:'4000',HIPICO_META_SEND_TIMEOUT_MS:'3500'}),4000);
});
