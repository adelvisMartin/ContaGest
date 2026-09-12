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
  const handlerStart=sendSource.indexOf('export default async function handler');
  assert.ok(handlerStart>=0,'sender handler must exist');
  const handlerSource=sendSource.slice(handlerStart);
  const config=handlerSource.indexOf('const senderConfig=metaSenderConfig()');
  const ready=handlerSource.indexOf('if(!senderConfig.ready)');
  const query=handlerSource.indexOf('const rows = await supabase(`hipico_outbox?');
  const claim=handlerSource.indexOf('const row = await claimRow(candidate)');
  assert.ok(config>=0&&ready>config&&query>ready&&claim>query);
});

test('status separates legacy Meta sender readiness from canonical backend webhook readiness',()=>{
  assert.match(statusSource,/import \{ isMetaPhoneNumberId, metaSenderConfig \} from '\.\/meta-runtime\.js'/);
  assert.doesNotMatch(statusSource,/metaWebhookConfig/);
  assert.match(statusSource,/WHATSAPP_VERIFY_TOKEN/);
  assert.match(statusSource,/WHATSAPP_APP_SECRET/);
  assert.match(statusSource,/WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(statusSource,/const sender = metaSenderConfig\(\)/);
  assert.match(statusSource,/const metaWebhookReady = webhookMissing\.length === 0/);
  assert.match(statusSource,/webhookAuthority: 'canonical_backend'/);
  assert.match(statusSource,/accessTokenStrong: sender\.accessTokenStrong/);
  assert.match(statusSource,/phoneNumberIdValid: sender\.phoneNumberIdValid/);
  assert.match(statusSource,/webhookPhoneNumberIdValid: secrets\.webhookPhoneNumberIdValid/);
});