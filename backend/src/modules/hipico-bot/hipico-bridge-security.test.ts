import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeTokenConfigured, bridgeTokenValid } from './hipico-bridge-security.js';

test('bridge token requires a strong configured secret and exact match',()=>{
  const env={HIPICO_GROUP_BRIDGE_TOKEN:'a'.repeat(64)} as NodeJS.ProcessEnv;
  assert.equal(bridgeTokenConfigured(env),true);
  assert.equal(bridgeTokenValid('a'.repeat(64),env),true);
  assert.equal(bridgeTokenValid('a'.repeat(63),env),false);
  assert.equal(bridgeTokenValid('b'.repeat(64),env),false);
});

test('bridge rejects missing and short server secrets',()=>{
  assert.equal(bridgeTokenConfigured({HIPICO_GROUP_BRIDGE_TOKEN:'short'} as NodeJS.ProcessEnv),false);
  assert.equal(bridgeTokenValid('short',{HIPICO_GROUP_BRIDGE_TOKEN:'short'} as NodeJS.ProcessEnv),false);
});
