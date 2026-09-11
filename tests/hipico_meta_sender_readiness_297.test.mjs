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

test('Meta Cloud webhook readiness shares the same phone identity boundary',()=>{
  assert.equal(metaWebhookConfig(base).ready,true);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_PHONE_NUMBER_ID:'phone-id'}).ready,false);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_VERIFY_TOKEN:'short'}).ready,false);
  assert.equal(metaWebhookConfig({...base,HIPICO_META_APP_SECRET:'PLACEHOLDER_PLACEHOLDER_PLACEHOLDER_PLACEHOLDER'}).ready,false);
});

test('sender validates Meta runtime before reading or claiming any outbox row',()=>{
  const config=sendSource.indexOf('const senderConfig=metaSenderConfig()');
  const ready=sendSource.indexOf('if(!senderConfig.ready)');
  const query=sendSource.indexOf('const rows = await supabase(`hipico_outbox?');
  const claim=sendSource.indexOf('const row = await claimRow(candidate)');
  assert.ok(config>=0&&ready>config&&query>ready&&claim>query);
});

test('status endpoint consumes canonical Meta sender and webhook readiness instead of raw presence only',()=>{
  assert.match(statusSource,/metaSenderConfig, metaWebhookConfig/);
  assert.match(statusSource,/sender\.ready/);
  assert.match(statusSource,/webhook\.ready/);
  assert.match(statusSource,/accessTokenStrong: sender\.accessTokenStrong/);
  assert.match(statusSource,/phoneNumberIdValid: sender\.phoneNumberIdValid && webhook\.phoneNumberIdValid/);
});
