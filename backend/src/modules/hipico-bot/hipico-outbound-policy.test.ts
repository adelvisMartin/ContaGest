import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCloudOutboundAllowed, cloudDestinationAllowed, cloudOutboundPolicy, __test__ } from './hipico-outbound-policy.js';

const SHA='a'.repeat(40);
const enabledEnv={
  HIPICO_CLOUD_SEND_ENABLED:'true',
  HIPICO_WHATSAPP_COMPLIANCE_DECISION:'GO',
  HIPICO_CLOUD_SEND_APPROVED_BY:'release-owner',
  HIPICO_CLOUD_SEND_CANDIDATE_SHA:SHA,
  VERCEL_GIT_COMMIT_SHA:SHA,
  HIPICO_CLOUD_ALLOWED_DESTINATIONS:'+584121234567,584141112233'
} as NodeJS.ProcessEnv;

test('cloud outbound is denied by default',()=>{
  const policy=cloudOutboundPolicy({});
  assert.equal(policy.enabled,false);
  assert.ok(policy.reasons.includes('SEND_SWITCH_DISABLED'));
  assert.ok(policy.reasons.includes('WHATSAPP_COMPLIANCE_NOT_GO'));
  assert.ok(policy.reasons.includes('CANDIDATE_SHA_NOT_BOUND'));
  assert.ok(policy.reasons.includes('DESTINATION_ALLOWLIST_EMPTY'));
});

test('cloud outbound requires explicit GO, approval, exact candidate SHA and destination allowlist',()=>{
  const policy=cloudOutboundPolicy(enabledEnv);
  assert.equal(policy.enabled,true);
  assert.equal(policy.allowedDestinationCount,2);
  assert.equal(policy.runtimeShaBound,true);
  assert.equal(cloudDestinationAllowed('+584121234567',enabledEnv),true);
  assert.equal(cloudDestinationAllowed('+584121234568',enabledEnv),false);
});

test('E164 destination normalization rejects more than 15 digits',()=>{
  assert.equal(__test__.recipient('+123456789012345'), '123456789012345');
  assert.equal(__test__.recipient('+1234567890123456'), null);
  assert.equal(__test__.recipient('123456789012345678'), null);
});

test('stale approval cannot authorize another deployed SHA',()=>{
  const policy=cloudOutboundPolicy({...enabledEnv,VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)});
  assert.equal(policy.enabled,false);
  assert.ok(policy.reasons.includes('CANDIDATE_SHA_NOT_BOUND'));
});

test('assertion rejects a valid-format but non-allowlisted recipient',()=>{
  assert.throws(()=>assertCloudOutboundAllowed('+584121234568',enabledEnv),(error:any)=>error?.code==='HIPICO_DESTINATION_NOT_ALLOWLISTED');
});
