import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecureSecret } from './env.js';

test('known development placeholders are never considered secure secrets',()=>{
  assert.equal(isSecureSecret('dev_secret_change_me_please_32_chars'),false);
  assert.equal(isSecureSecret('dev_license_secret_change_me_32_chars'),false);
  assert.equal(isSecureSecret('CHANGE_ME_THIS_SECRET_123456789012345'),false);
  assert.equal(isSecureSecret('dev-license-change-me-123456789012345'),false);
});

test('high-entropy-looking configured secrets remain eligible',()=>{
  assert.equal(isSecureSecret('p4f7Lx0QnV9wR2sT6uY8zA1cD3eF5gH7jK9m'),true);
  assert.equal(isSecureSecret('too-short'),false);
});
