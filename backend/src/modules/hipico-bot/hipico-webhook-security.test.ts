import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MIN_WEBHOOK_SECRET_LENGTH, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';

const routes=readFileSync(new URL('./hipico-webhook.routes.ts',import.meta.url),'utf8');
const strong='s'.repeat(MIN_WEBHOOK_SECRET_LENGTH);
const env={WHATSAPP_VERIFY_TOKEN:'v'.repeat(MIN_WEBHOOK_SECRET_LENGTH),WHATSAPP_APP_SECRET:strong};

test('webhook security rejects weak or missing secrets and compares verify tokens safely',()=>{
  assert.equal(webhookSecurityReady(env),true);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
  assert.equal(webhookSecurityReady({...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(webhookVerifyTokenValid(env.WHATSAPP_VERIFY_TOKEN,env),true);
  assert.equal(webhookVerifyTokenValid(`${env.WHATSAPP_VERIFY_TOKEN}x`,env),false);
  assert.equal(webhookVerifyTokenValid('short',{...env,WHATSAPP_VERIFY_TOKEN:'short'}),false);
});

test('webhook HMAC requires a strong app secret and exact raw-body signature',()=>{
  const raw=Buffer.from('{"object":"whatsapp_business_account"}');
  const signature=`sha256=${crypto.createHmac('sha256',strong).update(raw).digest('hex')}`;
  assert.equal(webhookSignatureValid(raw,signature,env),true);
  assert.equal(webhookSignatureValid(raw,`${signature.slice(0,-1)}0`,env),false);
  assert.equal(webhookSignatureValid(raw,signature,{...env,WHATSAPP_APP_SECRET:'short'}),false);
  assert.equal(webhookSignatureValid(undefined,signature,env),false);
});

test('backend webhook verifies configuration/signature and persistence before processing',()=>{
  const configCheck=routes.indexOf('webhookSecurityReady()');
  const signatureCheck=routes.indexOf('webhookSignatureValid(raw');
  const dbCheck=routes.indexOf('HipicoBotStore.dbReady(true)');
  const extraction=routes.indexOf('extractMessages(req.body)');
  assert.ok(configCheck>=0&&signatureCheck>configCheck&&dbCheck>signatureCheck&&extraction>dbCheck);
  assert.match(routes,/Persistencia Hípico no disponible/);
  assert.match(routes,/status\(503\).*retryable:true/);
});

test('backend webhook does not acknowledge a partially failed batch',()=>{
  assert.match(routes,/Promise\.allSettled\(messages\.map\(processIncoming\)\)/);
  assert.match(routes,/if\(failed\)[\s\S]*status\(503\)/);
  assert.match(routes,/status\(200\)\.json\(\{ok:true,received:messages\.length,processed:processed\.length,failed:0\}\)/);
});
