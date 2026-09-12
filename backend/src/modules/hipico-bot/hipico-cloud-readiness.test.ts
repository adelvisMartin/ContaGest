import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { promotion, sendCloudText } from './hipico-bot.service.js';
import { cloudTransportConfiguration } from './hipico-outbound-policy.js';

const ENV_KEYS=[
  'HIPICO_BOT_PROMOTION',
  'HIPICO_CLOUD_SEND_ENABLED',
  'HIPICO_WHATSAPP_COMPLIANCE_DECISION',
  'HIPICO_CLOUD_SEND_APPROVED_BY',
  'HIPICO_CLOUD_SEND_CANDIDATE_SHA',
  'HIPICO_CLOUD_ALLOWED_DESTINATIONS',
  'HIPICO_CLOUD_SEND_TIMEOUT_MS',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_SHA',
  'WHATSAPP_CLOUD_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_GRAPH_API_VERSION',
  'WHATSAPP_GRAPH_VERSION'
] as const;

const SHA='a'.repeat(40);
const allowedRecipient='584121234567';

function snapshotEnv(){
  return Object.fromEntries(ENV_KEYS.map((key)=>[key,process.env[key]]));
}
function restoreEnv(snapshot:Record<string,string|undefined>){
  for(const key of ENV_KEYS){
    const value=snapshot[key];
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
function configureOutbound({token='x'.repeat(64),phoneId='1234567890',version='v23.0',timeoutMs='12000'}={}){
  Object.assign(process.env,{
    HIPICO_BOT_PROMOTION:'automatic',
    HIPICO_CLOUD_SEND_ENABLED:'true',
    HIPICO_WHATSAPP_COMPLIANCE_DECISION:'GO',
    HIPICO_CLOUD_SEND_APPROVED_BY:'release-owner',
    HIPICO_CLOUD_SEND_CANDIDATE_SHA:SHA,
    HIPICO_CLOUD_ALLOWED_DESTINATIONS:`+${allowedRecipient}`,
    HIPICO_CLOUD_SEND_TIMEOUT_MS:timeoutMs,
    VERCEL_GIT_COMMIT_SHA:SHA,
    WHATSAPP_CLOUD_TOKEN:token,
    WHATSAPP_PHONE_NUMBER_ID:phoneId,
    WHATSAPP_GRAPH_API_VERSION:version
  });
  delete process.env.GIT_SHA;
  delete process.env.WHATSAPP_GRAPH_VERSION;
}

test('automatic promotion downgrades to approved when Meta Cloud transport is not strongly configured',()=>{
  const before=snapshotEnv();
  try{
    configureOutbound({token:'short',phoneId:'1234567890',version:'v23.0'});
    assert.equal(promotion(),'approved');
    configureOutbound({token:'x'.repeat(64),phoneId:'phone-id',version:'v23.0'});
    assert.equal(promotion(),'approved');
    configureOutbound({token:'x'.repeat(64),phoneId:'1234567890',version:'v23.0/path'});
    assert.equal(promotion(),'approved');
  }finally{restoreEnv(before);}
});

test('automatic promotion is available only when policy and strong transport readiness both pass',()=>{
  const before=snapshotEnv();
  try{
    configureOutbound();
    assert.equal(promotion(),'automatic');
  }finally{restoreEnv(before);}
});

test('backend Cloud timeout uses the canonical bounded send timeout contract',()=>{
  const strongEnv={
    WHATSAPP_CLOUD_TOKEN:'x'.repeat(64),
    WHATSAPP_PHONE_NUMBER_ID:'1234567890',
    WHATSAPP_GRAPH_API_VERSION:'v23.0'
  };
  assert.equal(cloudTransportConfiguration({...strongEnv,HIPICO_CLOUD_SEND_TIMEOUT_MS:'12000'}).timeoutMs,12000);
  assert.equal(cloudTransportConfiguration({...strongEnv,HIPICO_CLOUD_SEND_TIMEOUT_MS:'0'}).timeoutMs,12000);
  assert.equal(cloudTransportConfiguration({...strongEnv,HIPICO_CLOUD_SEND_TIMEOUT_MS:'not-a-number'}).timeoutMs,12000);
  assert.equal(cloudTransportConfiguration({...strongEnv,HIPICO_CLOUD_SEND_TIMEOUT_MS:'999999'}).timeoutMs,60000);
  assert.equal(cloudTransportConfiguration({...strongEnv,HIPICO_CLOUD_SEND_TIMEOUT_MS:'500'}).timeoutMs,1000);
  const service=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');
  assert.match(service,/AbortSignal\.timeout\(timeoutMs\)/);
  assert.doesNotMatch(service,/AbortSignal\.timeout\(10_000\)/);
});

test('sendCloudText rejects weak transport before attempting any network request',async()=>{
  const before=snapshotEnv();
  const previousFetch=globalThis.fetch;
  let calls=0;
  try{
    configureOutbound({token:'short',phoneId:'1234567890',version:'v23.0'});
    globalThis.fetch=(async()=>{
      calls+=1;
      throw new Error('network must not be reached');
    }) as typeof fetch;
    await assert.rejects(
      sendCloudText(allowedRecipient,'Estado de prueba'),
      (error:any)=>error?.code==='HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED'
    );
    assert.equal(calls,0);
  }finally{
    globalThis.fetch=previousFetch;
    restoreEnv(before);
  }
});

test('operator outbound preflight blocks unready transport before DB/outbox claim',()=>{
  const routes=readFileSync(new URL('./hipico-operator.routes.ts',import.meta.url),'utf8');
  const preflightStart=routes.indexOf('function outboundPreflight');
  const preflightEnd=routes.indexOf('async function persistSendFailure',preflightStart);
  assert.ok(preflightStart>=0&&preflightEnd>preflightStart);
  const preflight=routes.slice(preflightStart,preflightEnd);
  assert.match(preflight,/cloudTransportConfiguration\(\)/);
  assert.match(preflight,/sender_not_configured/);
  assert.match(preflight,/status:\s*503/);

  const testMessageStart=routes.indexOf("router.post('/test-message'");
  const testMessageEnd=routes.indexOf("router.post('/approve/:id'",testMessageStart);
  const testMessage=routes.slice(testMessageStart,testMessageEnd);
  assert.ok(testMessage.indexOf('outboundPreflight')<testMessage.indexOf('HipicoBotStore.dbReady'));
  assert.match(testMessage,/res\.status\(preflight\.status\)/);

  const approve=routes.slice(testMessageEnd);
  assert.ok(approve.indexOf('outboundPreflight')<approve.indexOf('claimForSend'));
  assert.match(approve,/res\.status\(preflight\.status\)/);
});
