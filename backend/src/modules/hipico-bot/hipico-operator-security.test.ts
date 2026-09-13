import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_OPERATOR_TOKEN_LENGTH,
  automationOwnerApprovalTokenConfigured,
  automationOwnerApprovalTokenValid,
  configuredAutomationOwnerApprovalToken,
  configuredOperatorToken,
  operatorTokenConfigured,
  operatorTokenValid
} from './hipico-operator-security.js';

const strongToken = 'operator-control-token-32-bytes-minimum-1234567890';
const legacyStrongToken = 'legacy-operator-token-32-bytes-minimum-1234567890';
const ownerApprovalToken = 'automation-owner-approval-32-bytes-minimum-1234567890';

test('operator control requires a strong configured token', () => {
  assert.equal(operatorTokenConfigured({}), false);
  assert.equal(operatorTokenConfigured({ HIPICO_OPERATOR_CONTROL_TOKEN: 'short' }), false);
  assert.equal(MIN_OPERATOR_TOKEN_LENGTH, 32);
  assert.equal(operatorTokenValid('short', { HIPICO_OPERATOR_CONTROL_TOKEN: 'short' }), false);
});

test('primary operator control token takes precedence and validates exactly', () => {
  const env = {
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_BOT_OPERATOR_TOKEN: legacyStrongToken
  };
  assert.equal(configuredOperatorToken(env), strongToken);
  assert.equal(operatorTokenConfigured(env), true);
  assert.equal(operatorTokenValid(strongToken, env), true);
  assert.equal(operatorTokenValid(`${strongToken}x`, env), false);
  assert.equal(operatorTokenValid(legacyStrongToken, env), false);
});

test('legacy operator token remains supported only when it meets the same strength policy', () => {
  const legacyEnv = { HIPICO_BOT_OPERATOR_TOKEN: legacyStrongToken };
  assert.equal(configuredOperatorToken(legacyEnv), legacyStrongToken);
  assert.equal(operatorTokenConfigured(legacyEnv), true);
  assert.equal(operatorTokenValid(legacyStrongToken, legacyEnv), true);
  assert.equal(operatorTokenValid('wrong-token', legacyEnv), false);
});

test('AUTOMATIC owner approval uses an independent strong server secret', () => {
  const env = {
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN: ownerApprovalToken
  };
  assert.equal(configuredAutomationOwnerApprovalToken(env), ownerApprovalToken);
  assert.equal(automationOwnerApprovalTokenConfigured(env), true);
  assert.equal(automationOwnerApprovalTokenValid(ownerApprovalToken, env), true);
  assert.equal(automationOwnerApprovalTokenValid('wrong-owner-approval', env), false);
});

test('owner approval fails closed when weak, placeholder, missing or reused from operator control', () => {
  assert.equal(automationOwnerApprovalTokenConfigured({}), false);
  assert.equal(automationOwnerApprovalTokenConfigured({
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN: 'short'
  }), false);
  assert.equal(automationOwnerApprovalTokenConfigured({
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN: 'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'
  }), false);
  assert.equal(automationOwnerApprovalTokenConfigured({
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN: strongToken
  }), false);
  assert.equal(automationOwnerApprovalTokenValid(strongToken, {
    HIPICO_OPERATOR_CONTROL_TOKEN: strongToken,
    HIPICO_AUTOMATION_OWNER_APPROVAL_TOKEN: strongToken
  }), false);
});
