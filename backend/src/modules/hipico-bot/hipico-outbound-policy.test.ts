import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCloudOutboundAllowed, assertCloudTransportConfigured, cloudDestinationAllowed, cloudOutboundPolicy, cloudTransportConfiguration, __test__ } from './hipico-outbound-policy.js';

const SHA='a'.repeat(40);
const enabledEnv={
  HIPICO_CLOUD_SEND_ENABLED:'true',
  HIPICO_WHATSAPP_COMPLIANCE_DECISION:'GO',
  HIPICO_CLOUD_SEND_APPROVED_BY:'release-owner',
  HIPICO_CLOUD_SEND_CANDIDATE_SHA:SHA,
  VERCEL_GIT_COMMIT_SHA:SHA,
  HIPICO_CLOUD_ALLOWED_DESTINATIONS:'+584121234567,584141112233'
} as NodeJS.ProcessEnv;
const transportEnv={
  WHATSAPP_CLOUD_TOKEN:'x'.repeat(64),
  WHATSAPP_PHONE_NUMBER_ID:'1234567890',
  WHATSAPP_GRAPH_API_VERSION:'v23.0'
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

test('Meta Cloud transport requires strong token numeric phone id and bounded Graph version syntax',()=>{
  const valid=cloudTransportConfiguration(transportEnv);
  assert.equal(valid.configured,true);
  assert.deepEqual(valid.reasons,[]);
  assert.equal(valid.phoneId,'1234567890');
  assert.equal(valid.version,'v23.0');
  assert.deepEqual(assertCloudTransportConfigured(transportEnv),{
    token:'x'.repeat(64),phoneId:'1234567890',version:'v23.0'
  });

  const cases=[
    [{...transportEnv,WHATSAPP_CLOUD_TOKEN:'short'},'CLOUD_TOKEN_NOT_CONFIGURED'],
    [{...transportEnv,WHATSAPP_CLOUD_TOKEN:'REEMPLAZA_CON_SECRETO_ALEATORIO_32_CHARS_MINIMO'},'CLOUD_TOKEN_NOT_CONFIGURED'],
    [{...transportEnv,WHATSAPP_PHONE_NUMBER_ID:'phone-id'},'PHONE_NUMBER_ID_INVALID'],
    [{...transportEnv,WHATSAPP_GRAPH_API_VERSION:'23'},'GRAPH_VERSION_INVALID'],
    [{...transportEnv,WHATSAPP_GRAPH_API_VERSION:'v23.0/path'},'GRAPH_VERSION_INVALID']
  ] as const;
  for(const [env,reason] of cases){
    const config=cloudTransportConfiguration(env);
    assert.equal(config.configured,false);
    assert.ok(config.reasons.includes(reason));
    assert.throws(()=>assertCloudTransportConfigured(env),(error:any)=>error?.code==='HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED');
  }
});

test('default Graph version remains a known valid version when the variable is absent',()=>{
  const config=cloudTransportConfiguration({...transportEnv,WHATSAPP_GRAPH_API_VERSION:undefined,WHATSAPP_GRAPH_VERSION:undefined});
  assert.equal(config.configured,true);
  assert.equal(config.version,'v23.0');
  assert.equal(__test__.GRAPH_VERSION.test(config.version),true);
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
