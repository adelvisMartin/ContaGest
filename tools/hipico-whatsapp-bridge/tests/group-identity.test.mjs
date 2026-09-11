import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroupId } from '../src/group-identity.mjs';

test('local WhatsApp bridge accepts modern and legacy group JIDs only',()=>{
  assert.equal(isGroupId('120363111111111111@g.us'),true);
  assert.equal(isGroupId('120363222222222222-2222222222@g.us'),true);
  assert.equal(isGroupId('12345@g.us'),false);
  assert.equal(isGroupId('1234-5678@g.us'),false);
  assert.equal(isGroupId('584121234567@s.whatsapp.net'),false);
  assert.equal(isGroupId('not-a-group'),false);
});
