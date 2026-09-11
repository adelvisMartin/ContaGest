import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ as senderTest } from '../frontend/api/hipico/whatsapp-send.js';
import { __test__ as statusTest } from '../frontend/api/hipico/status.js';

const senderSource=readFileSync(new URL('../frontend/api/hipico/whatsapp-send.js',import.meta.url),'utf8');
const statusSource=readFileSync(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');
const phone='1234567890';
const strongToken='x'.repeat(48);

test('serverless Meta sender rejects empty, short and public-placeholder access tokens',()=>{
  for(const accessToken of ['', 'short-token', 'CHANGE_ME_'+'x'.repeat(40), 'YOUR_TOKEN_'+'x'.repeat(40)]){
    const config=senderTest.metaSenderConfig({HIPICO_META_ACCESS_TOKEN:accessToken,HIPICO_META_PHONE_NUMBER_ID:phone});
    assert.equal(config.ready,false);
    assert.equal(config.accessTokenStrong,false);
  }
});

test('serverless Meta sender requires both a strong token and numeric phone id',()=>{
  const ready=senderTest.metaSenderConfig({HIPICO_META_ACCESS_TOKEN:strongToken,HIPICO_META_PHONE_NUMBER_ID:phone});
  assert.equal(ready.ready,true);
  assert.equal(ready.accessTokenStrong,true);
  assert.equal(ready.phoneNumberIdValid,true);

  const badPhone=senderTest.metaSenderConfig({HIPICO_META_ACCESS_TOKEN:strongToken,HIPICO_META_PHONE_NUMBER_ID:'phone-id'});
  assert.equal(badPhone.ready,false);
  assert.equal(badPhone.phoneNumberIdValid,false);
});

test('status and sender share the same strong Meta access-token policy',()=>{
  assert.equal(statusTest.secretReadiness({HIPICO_META_ACCESS_TOKEN:strongToken}).metaAccessTokenStrong,true);
  assert.equal(statusTest.secretReadiness({HIPICO_META_ACCESS_TOKEN:'CHANGE_ME_'+'x'.repeat(40)}).metaAccessTokenStrong,false);
  assert.match(senderSource,/strongSecretConfigured\(accessToken\)/);
  assert.match(statusSource,/secrets\.metaAccessTokenStrong/);
  assert.match(statusSource,/accessTokenStrong:\s*secrets\.metaAccessTokenStrong/);
});
