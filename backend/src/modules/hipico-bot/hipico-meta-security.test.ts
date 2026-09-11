import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { MIN_META_SECRET_LENGTH, metaSignatureValid, metaVerifyTokenValid, metaWebhookRuntimeConfigured, metaWebhookSecretsConfigured } from './hipico-meta-security.js';

const strong='x'.repeat(MIN_META_SECRET_LENGTH);
const env={WHATSAPP_VERIFY_TOKEN:strong,WHATSAPP_APP_SECRET:strong,WHATSAPP_PHONE_NUMBER_ID:'123456789'};

test('backend Meta webhook secrets fail closed below 32 characters',()=>{
  assert.equal(metaWebhookSecretsConfigured(env),true);
  assert.equal(metaWebhookSecretsConfigured({...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
  assert.equal(metaWebhookSecretsConfigured({...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(metaVerifyTokenValid(strong,env),true);
  assert.equal(metaVerifyTokenValid('wrong',env),false);
  assert.equal(metaVerifyTokenValid('short',{...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
});

test('backend Meta runtime readiness also requires the configured phone number id',()=>{
  assert.equal(metaWebhookRuntimeConfigured(env),true);
  assert.equal(metaWebhookRuntimeConfigured({...env,WHATSAPP_PHONE_NUMBER_ID:''}),false);
  assert.equal(metaWebhookRuntimeConfigured({...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
});

test('backend Meta signature uses HMAC SHA-256 and rejects weak secret configuration',()=>{
  const raw=Buffer.from('{"ok":true}');
  const signature=`sha256=${crypto.createHmac('sha256',strong).update(raw).digest('hex')}`;
  assert.equal(metaSignatureValid(raw,signature,env),true);
  assert.equal(metaSignatureValid(raw,'sha256='+'0'.repeat(64),env),false);
  assert.equal(metaSignatureValid(raw,signature,{...env,WHATSAPP_APP_SECRET:'short'}),false);
});
