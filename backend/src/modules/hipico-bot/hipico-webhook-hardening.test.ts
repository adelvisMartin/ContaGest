import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-webhook.routes.js';
import { webhookSecurityReady, webhookPhoneNumberId } from './hipico-webhook-security.js';

const source=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const strong='x'.repeat(40);
const env={WHATSAPP_VERIFY_TOKEN:strong,WHATSAPP_APP_SECRET:strong,WHATSAPP_PHONE_NUMBER_ID:'1234567890'};

function statusEnvelope(phoneNumberId='1234567890'){
  return{entry:[{changes:[{value:{metadata:{phone_number_id:phoneNumberId},statuses:[{id:'wamid-status-1',status:'delivered'}]}}]}]};
}

test('Cloud webhook runtime readiness includes a valid configured phone number id',()=>{
  assert.equal(webhookSecurityReady(env),true);
  assert.equal(webhookPhoneNumberId(env),'1234567890');
  assert.equal(webhookSecurityReady({...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),false);
  assert.equal(webhookPhoneNumberId({...env,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),'');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],env),null);
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'9999999999'}],env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.webhookIdentityError([{phoneNumberId:'1234567890'}],{...env,WHATSAPP_PHONE_NUMBER_ID:''}),'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED');
});

test('Cloud webhook uses the canonical security module and immutable replay guard',()=>{
  assert.match(source,/webhookPhoneNumberId, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid/);
  assert.match(source,/assertPersistedWebhookReplay/);
  assert.doesNotMatch(source,/import \{[^}]*signatureValid[^}]*\} from '\.\/hipico-bot\.service\.js'/);
});

test('Cloud webhook verifies runtime readiness, signature and signed envelope identity before extraction or persistence',()=>{
  const post=source.slice(source.indexOf("router.post('/webhook'"),source.indexOf('export default router'));
  const readiness=post.indexOf('webhookSecurityReady()');
  const signature=post.indexOf('webhookSignatureValid(raw');
  const envelopeIdentity=post.indexOf('rawEnvelopeIdentityError(req.body)');
  const extraction=post.indexOf('extractMessages(req.body)');
  const messageIdentity=post.indexOf('webhookIdentityError(messages)');
  const persistence=post.indexOf('HipicoBotStore.dbReady(true)');
  const processing=post.indexOf('processMessagesBounded(messages)');
  assert.ok(readiness>=0&&signature>readiness&&envelopeIdentity>signature&&extraction>envelopeIdentity&&messageIdentity>extraction&&persistence>messageIdentity&&processing>persistence);
});

test('Cloud webhook never silently truncates a valid signed batch',()=>{
  assert.equal(__test__.WEBHOOK_BATCH_CONCURRENCY,25);
  assert.doesNotMatch(source,/extractMessages\(req\.body\)\.slice\(/);
  assert.match(source,/for\(let offset=0;offset<messages\.length;offset\+=WEBHOOK_BATCH_CONCURRENCY\)/);
});

test('partial processing failure remains retryable and is never acknowledged with HTTP 200',()=>{
  assert.match(source,/if\(result\.failed>0\)/);
  assert.match(source,/if\(result\.failed>0\)[\s\S]*status\(503\)/);
  assert.match(source,/retryable:true/);
});

test('mutated provider-message replay is rejected but acknowledged to avoid Meta retry storms',()=>{
  assert.match(source,/WEBHOOK_REPLAY_MISMATCH/);
  assert.match(source,/if\(result\.mismatched>0\)[\s\S]*status\(200\)/);
  assert.match(source,/error:'webhook_replay_mismatch'/);
  assert.match(source,/acknowledged:true,accepted:false,retryable:false/);
});

test('malformed item in a signed batch cannot make valid sibling messages disappear',()=>{
  const extraction=source.indexOf('const messages=extractMessages(req.body)');
  const invalidCount=source.indexOf('const invalidMessages=Math.max(0,expectedRawMessages-messages.length)');
  const persistence=source.indexOf('HipicoBotStore.dbReady(true)');
  const processing=source.indexOf('const result=await processMessagesBounded(messages)');
  const partialAck=source.indexOf("error:'invalid_message_identity_partial'");
  assert.ok(extraction>=0&&invalidCount>extraction&&persistence>invalidCount&&processing>persistence&&partialAck>processing);
  assert.match(source,/accepted:true,\n\s*partial:true,\n\s*retryable:false/);
  assert.match(source,/received:expectedRawMessages/);
  assert.match(source,/invalidMessages/);
  assert.doesNotMatch(source,/if\(messages\.length!==expectedRawMessages\)[\s\S]{0,180}return res\.status\(200\)/);
});

test('a fully malformed signed message set is permanently acknowledged without touching persistence',()=>{
  const empty=source.indexOf('if(messages.length===0)');
  const allInvalid=source.indexOf('if(invalidMessages>0)',empty);
  const persistence=source.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(empty>=0&&allInvalid>empty&&persistence>allInvalid);
  assert.match(source,/error:'invalid_message_identity'/);
  assert.match(source,/accepted:false,retryable:false/);
});

test('foreign phone identity remains an envelope-level permanent reject before durable processing',()=>{
  const envelope=source.indexOf('rawEnvelopeIdentityError(req.body)');
  const extraction=source.indexOf('extractMessages(req.body)');
  const persistence=source.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(envelope>=0&&extraction>envelope&&persistence>extraction);
  assert.match(source,/error:'webhook_phone_number_mismatch'/);
  assert.match(source,/status\(200\).*accepted:false/s);
});

test('signed status-only callbacks are bound to raw envelope phone identity before PostgreSQL bypass',()=>{
  assert.equal(__test__.rawEnvelopeIdentityError(statusEnvelope(),env),null);
  assert.equal(__test__.rawEnvelopeIdentityError(statusEnvelope('9999999999'),env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  assert.equal(__test__.rawEnvelopeIdentityError({entry:[{changes:[{value:{statuses:[{id:'s1'}]}}]}]},env),'WEBHOOK_PHONE_NUMBER_MISMATCH');
  const envelope=source.indexOf('const envelopeIdentityError=rawEnvelopeIdentityError(req.body)');
  const empty=source.indexOf('if(messages.length===0)');
  const db=source.indexOf('HipicoBotStore.dbReady(true)');
  assert.ok(envelope>=0&&empty>envelope&&db>empty);
});
