import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_META_FUTURE_SKEW_MS, metaTimestampValid, normalizeMetaTimestamp } from '../frontend/api/hipico/meta-timestamp-policy.js';
import { __test__ as webhookTest } from '../frontend/api/hipico/whatsapp-webhook.js';

const backendPolicy=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-meta-timestamp-policy.ts',import.meta.url),'utf8');
const backendRoute=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');

test('serverless Meta timestamps are exact Unix seconds with a five-minute future skew budget',()=>{
  const now=Date.parse('2026-09-12T02:00:00.000Z');
  const historical=Math.floor(Date.parse('2024-06-07T08:09:10.000Z')/1000);
  assert.equal(normalizeMetaTimestamp(String(historical),now),'2024-06-07T08:09:10.000Z');
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)),now),true);
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)+1),now),false);
  for(const value of ['',null,undefined,'-1','1.5','1e9','not-a-number']) assert.equal(metaTimestampValid(value,now),false);
});

test('serverless message identity rejects future provider timestamps even when ISO conversion itself is valid',()=>{
  const futureSeconds=String(Math.floor((Date.now()+MAX_META_FUTURE_SKEW_MS+60_000)/1000));
  const message={
    externalMessageId:'wamid-future-1',channelKey:'1234567890',senderId:'584121234567',senderLabel:'',
    timestamp:new Date(Number(futureSeconds)*1000).toISOString(),type:'text',text:'hola',quotedExternalMessageId:null,
    raw:{timestamp:futureSeconds}
  };
  assert.equal(webhookTest.validMetaMessageIdentity(message),false);
});

test('backend and serverless policy remain locked to the same skew and batch-partition model',()=>{
  assert.match(backendPolicy,/MAX_META_FUTURE_SKEW_MS=5\*60\*1000/);
  assert.match(backendPolicy,/^const UNIX_SECONDS=\/\^\\d\{1,12\}\$\//m);
  assert.match(backendRoute,/const extractedMessages=extractMessages\(req\.body\)/);
  assert.match(backendRoute,/const messages=extractedMessages\.filter\(webhookTimestampValid\)/);
  assert.match(backendRoute,/expectedRawMessages-messages\.length/);
});
