import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metaSenderConfig, metaWebhookConfig } from '../frontend/api/hipico/meta-runtime.js';

const sendSource=await readFile(new URL('../frontend/api/hipico/whatsapp-send.js',import.meta.url),'utf8');
const statusSource=await readFile(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');

const strongToken='t'.repeat(40);
const base={
  HIPICO_META_ACCESS_TOKEN:strongToken,
  HIPICO_META_PHONE_NUMBER_ID:'1234567890',
  HIPICO_META_VERIFY_TOKEN:'v'.repeat(40),
  HIPICO_META_APP_SECRET:'a'.repeat(40)
};

test('Meta Cloud sender readiness requires strong token plus numeric phone id',()=>{
  assert.equal(metaSenderConfig(base).ready,true);
  assert.equal(metaSenderConfig({...base,HIPICO_META_ACCESS_TOKEN:'short'}).ready,false);
  assert.equal(metaSenderConfig({...base,HIPICO_META_ACCESS_TOKEN:'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'}).ready,false);
  assert.equal(metaSenderConfig({...base,HIPICO_META_PHONE_NUMBER_ID:'phone-id'}).ready,false);
});

test('Meta sender Graph version defaults safely only when omitted and rejects explicit malformed configuration',()=>{
  const defaulted=metaSenderConfig(base);
  assert.equal(defaulted.graphVersion,'v23.0');
  assert.equal(defaulted.graphVersionValid,true);
  assert.equal(defaulted.graphVersionDefaulted,true);

  const explicit=metaSenderConfig({...base,HIPICO_META_GRAPH_VERSION:'v24.1'});
  assert.equal(explicit.ready,true);
  assert.equal(explicit.graphVersion,'v24.1');
  assert.equal(explicit.graphVersionValid,true);
  assert.equal(explicit.graphVersionDefaulted,false);

  for(const graphVersion of ['23.0','v23','v23.0/path','https://example.test','v123456789.1']){
    const invalid=metaSenderConfig({...base,HIPICO_META_GRAPH_VERSION:graphVersion});
    assert.equal(invalid.ready,false,`${graphVersion} must fail readiness`);
    assert.equal(invalid.graphVersionValid,false);
    assert.equal(invalid.graphVersionDefaulted,false);
  }
});

test('Meta Cloud webhook readiness shares the same phone identity boundary',()=>{
  assert.equal(metaWebhookConfig(base).ready,true);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_PHONE_NUMBER_ID:'phone-id'}).ready,false);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_VERIFY_TOKEN:'short'}).ready,false);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_APP_SECRET:'PLACEHOLDER_PLACEHOLDER_PLACEHOLDER_PLACEHOLDER'}).ready,false);
});

test('sender validates Meta runtime before reading or claiming any outbox row',()=>{
  const handlerStart=sendSource.indexOf('export default async function handler');
  assert.ok(handlerStart>=0,'sender handler must exist');
  const handlerSource=sendSource.slice(handlerStart);
  const config=handlerSource.indexOf('const senderConfig=metaSenderConfig()');
  const ready=handlerSource.indexOf('if(!senderConfig.ready)');
  const query=handlerSource.indexOf('const rows = await supabase(`hipico_outbox?');
  const claim=handlerSource.indexOf('const row = await claimRow(candidate)');
  assert.ok(config>=0&&ready>config&&query>ready&&claim>query);
  assert.match(handlerSource,/graphVersion=senderConfig\.graphVersion/);
  assert.doesNotMatch(handlerSource,/safeGraphVersion\(\)/);
});

test('status endpoint consumes canonical Meta sender and webhook readiness instead of raw presence only',()=>{
  assert.match(statusSource,/metaSenderConfig, metaWebhookConfig/);
  assert.match(statusSource,/sender\.ready/);
  assert.match(statusSource,/webhook\.ready/);
  assert.match(statusSource,/accessTokenStrong: sender\.accessTokenStrong/);
  assert.match(statusSource,/phoneNumberIdValid: sender\.phoneNumberIdValid && webhook\.phoneNumberIdValid/);
  assert.match(statusSource,/graphVersionValid: sender\.graphVersionValid/);
});
