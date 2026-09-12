import assert from 'node:assert/strict';
import test from 'node:test';
import { metaOutboundPolicy } from '../frontend/api/hipico/_shared.js';

const sha='a'.repeat(40);
const gate={
  HIPICO_CLOUD_SEND_ENABLED:'true',
  HIPICO_WHATSAPP_COMPLIANCE_DECISION:'GO',
  HIPICO_CLOUD_SEND_APPROVED_BY:'release-owner',
  HIPICO_CLOUD_SEND_CANDIDATE_SHA:sha,
  HIPICO_CLOUD_ALLOWED_DESTINATIONS:'+584121234567'
};

test('#305 serverless exact-SHA gate recognizes native Vercel/GitHub and documented generic commit SHA sources',()=>{
  assert.equal(metaOutboundPolicy({...gate,VERCEL_GIT_COMMIT_SHA:sha}).enabled,true);
  assert.equal(metaOutboundPolicy({...gate,GITHUB_SHA:sha}).enabled,true);
  assert.equal(metaOutboundPolicy({...gate,GIT_COMMIT_SHA:sha}).enabled,true);
  assert.equal(metaOutboundPolicy({...gate,GIT_SHA:sha}).enabled,true);
});

test('#305 exact-SHA gate remains fail-closed for malformed, absent or mismatched runtime identities',()=>{
  assert.equal(metaOutboundPolicy({...gate}).enabled,false);
  assert.equal(metaOutboundPolicy({...gate,GITHUB_SHA:'short'}).enabled,false);
  assert.equal(metaOutboundPolicy({...gate,GIT_COMMIT_SHA:'b'.repeat(40)}).enabled,false);
});
