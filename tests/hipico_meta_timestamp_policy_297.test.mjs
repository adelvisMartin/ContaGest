import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_META_FUTURE_SKEW_MS, metaTimestampValid, normalizeMetaTimestamp } from '../frontend/api/hipico/meta-timestamp-policy.js';

const backendPolicy=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-meta-timestamp-policy.ts',import.meta.url),'utf8');
const backendRoute=readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-webhook.routes.ts',import.meta.url),'utf8');
const serverless=readFileSync(new URL('../frontend/api/hipico/whatsapp-webhook.js',import.meta.url),'utf8');

test('Meta timestamps are exact Unix seconds with a five-minute future skew budget',()=>{
  const now=Date.parse('2026-09-12T02:00:00.000Z');
  const historical=Math.floor(Date.parse('2024-06-07T08:09:10.000Z')/1000);
  assert.equal(normalizeMetaTimestamp(String(historical),now),'2024-06-07T08:09:10.000Z');
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)),now),true);
  assert.equal(metaTimestampValid(String(Math.floor((now+MAX_META_FUTURE_SKEW_MS)/1000)+1),now),false);
  for(const value of ['',null,undefined,'-1','1.5','1e9','not-a-number'])assert.equal(metaTimestampValid(value,now),false);
});

test('canonical backend validates provider timestamps before persistent processing',()=>{
  assert.match(backendPolicy,/MAX_META_FUTURE_SKEW_MS=5\*60\*1000/);
  assert.match(backendPolicy,/^const UNIX_SECONDS=\/\^\\d\{1,12\}\$\//m);
  assert.match(backendRoute,/const extractedMessages=extractMessages\(req\.body\)/);
  assert.match(backendRoute,/const messages=extractedMessages\.filter\(webhookTimestampValid\)/);
  assert.match(backendRoute,/expectedRawMessages-messages\.length/);
});

test('serverless Meta boundary verifies the signature then delegates the untouched body to canonical backend',()=>{
  const signature=serverless.indexOf('verifyMetaSignature(raw');
  const proxy=serverless.indexOf('proxyCanonicalRequest({');
  const body=serverless.indexOf('body:raw');
  assert.ok(signature>=0&&proxy>signature&&body>proxy);
  assert.match(serverless,/path:'\/api\/v1\/hipico-bot\/webhook'/);
  assert.doesNotMatch(serverless,/metaTimestampValid|validMetaMessageIdentity|persistMetaMessage/);
});
