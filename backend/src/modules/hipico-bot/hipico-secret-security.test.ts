import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeTokenConfigured, bridgeTokenValid } from './hipico-bridge-security.js';
import { metaSignatureValid, metaVerifyTokenValid, metaWebhookRuntimeConfigured, metaWebhookSecretsConfigured } from './hipico-meta-security.js';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import { hipicoNumericProviderIdConfigured, hipicoRuntimeSecretConfigured } from './hipico-secret-security.js';
import crypto from 'node:crypto';

const PLACEHOLDER='REEMPLAZA_CON_SECRETO_ALEATORIO_32_CHARS_MINIMO';
const SECRET='d9zL3wY7eQ2pR8mK4xV6cN1sA5uH0jFt';

test('runtime secret policy rejects short and public placeholder values',()=>{
  assert.equal(hipicoRuntimeSecretConfigured('x'.repeat(31)),false);
  assert.equal(hipicoRuntimeSecretConfigured(PLACEHOLDER),false);
  assert.equal(hipicoRuntimeSecretConfigured('CHANGE_ME_WITH_A_SECRET_THAT_IS_LONG_ENOUGH_123456'),false);
  assert.equal(hipicoRuntimeSecretConfigured(SECRET),true);
});

test('bridge and operator token readiness use the centralized secret quality policy',()=>{
  assert.equal(bridgeTokenConfigured({HIPICO_GROUP_BRIDGE_TOKEN:PLACEHOLDER} as NodeJS.ProcessEnv),false);
  assert.equal(bridgeTokenConfigured({HIPICO_GROUP_BRIDGE_TOKEN:SECRET} as NodeJS.ProcessEnv),true);
  assert.equal(bridgeTokenValid(SECRET,{HIPICO_GROUP_BRIDGE_TOKEN:SECRET} as NodeJS.ProcessEnv),true);
  assert.equal(bridgeTokenValid(PLACEHOLDER,{HIPICO_GROUP_BRIDGE_TOKEN:PLACEHOLDER} as NodeJS.ProcessEnv),false);

  assert.equal(operatorTokenConfigured({HIPICO_OPERATOR_CONTROL_TOKEN:PLACEHOLDER} as NodeJS.ProcessEnv),false);
  assert.equal(operatorTokenConfigured({HIPICO_OPERATOR_CONTROL_TOKEN:SECRET} as NodeJS.ProcessEnv),true);
  assert.equal(operatorTokenValid(SECRET,{HIPICO_OPERATOR_CONTROL_TOKEN:SECRET} as NodeJS.ProcessEnv),true);
  assert.equal(operatorTokenValid(PLACEHOLDER,{HIPICO_OPERATOR_CONTROL_TOKEN:PLACEHOLDER} as NodeJS.ProcessEnv),false);
});

test('Meta webhook rejects placeholder secrets and malformed phone number ids',()=>{
  const valid={WHATSAPP_VERIFY_TOKEN:SECRET,WHATSAPP_APP_SECRET:SECRET,WHATSAPP_PHONE_NUMBER_ID:'123456789012345'};
  assert.equal(metaWebhookSecretsConfigured(valid),true);
  assert.equal(metaWebhookRuntimeConfigured(valid),true);
  assert.equal(metaWebhookSecretsConfigured({...valid,WHATSAPP_VERIFY_TOKEN:PLACEHOLDER}),false);
  assert.equal(metaWebhookSecretsConfigured({...valid,WHATSAPP_APP_SECRET:PLACEHOLDER}),false);
  assert.equal(metaWebhookRuntimeConfigured({...valid,WHATSAPP_PHONE_NUMBER_ID:'phone-id'}),false);
  assert.equal(metaWebhookRuntimeConfigured({...valid,WHATSAPP_PHONE_NUMBER_ID:'1234'}),false);
  assert.equal(hipicoNumericProviderIdConfigured('1234567890'),true);
  assert.equal(hipicoNumericProviderIdConfigured('123/456'),false);
});

test('Meta verification and HMAC helpers refuse a configured public placeholder',()=>{
  const raw=Buffer.from('{"entry":[]}');
  const placeholderEnv={WHATSAPP_VERIFY_TOKEN:PLACEHOLDER,WHATSAPP_APP_SECRET:PLACEHOLDER};
  const signature=`sha256=${crypto.createHmac('sha256',PLACEHOLDER).update(raw).digest('hex')}`;
  assert.equal(metaVerifyTokenValid(PLACEHOLDER,placeholderEnv),false);
  assert.equal(metaSignatureValid(raw,signature,placeholderEnv),false);
});
