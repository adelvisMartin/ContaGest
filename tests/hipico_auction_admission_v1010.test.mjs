import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAuctionAdmission, evaluateAuctionAdmission } from '../scripts/hipico-auction-admission-v1010.mjs';

const input = JSON.parse(readFileSync(new URL('../config/hipico-auction-admission-v1010.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(input);

test('baseline contract is valid but never authorizes product operation', () => {
  assert.deepEqual(validateAuctionAdmission(input), []);
  const result = evaluateAuctionAdmission(input);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.canCreateSchema, false);
  assert.equal(result.canAcceptBids, false);
  assert.equal(result.canSettle, false);
  assert.equal(result.canUseRealWhatsApp, false);
});
test('unapproved switch to GO fails closed', () => {
  const m = copy(); m.decision = 'GO';
  assert.match(validateAuctionAdmission(m).join(';'), /PREMATURE_GO/);
  assert.equal(evaluateAuctionAdmission(m).canSettle, false);
});
test('unapproved owner flag does not authorize schema writes', () => {
  const m = copy(); m.approval.status = 'APPROVED';
  assert.match(validateAuctionAdmission(m).join(';'), /APPROVAL_NOT_ESTABLISHED/);
  assert.equal(evaluateAuctionAdmission(m).canCreateSchema, false);
});
test('no race betting or live WhatsApp transport can be smuggled in', () => {
  const m = copy(); m.separation.raceBetting = 'ENABLED'; m.separation.realWhatsApp = 'ENABLED';
  assert.match(validateAuctionAdmission(m).join(';'), /FINANCIAL_OR_CHANNEL_AUTHORITY_VIOLATION/);
});
test('no second financial source of truth', () => {
  const m = copy(); m.separation.existingHipicoLedger = 'REPLACE';
  assert.match(validateAuctionAdmission(m).join(';'), /FINANCIAL_OR_CHANNEL_AUTHORITY_VIOLATION/);
});
test('settlement cannot be marked executable without financial owner', () => {
  const m = copy(); m.workflows.find(w => w.id === 'settlement').status = 'READY';
  assert.match(validateAuctionAdmission(m).join(';'), /WORKFLOW_MUST_REMAIN_DESIGN_ONLY/);
});
test('required roles and independent monetary approvals are retained', () => {
  const m = copy(); m.roles = ['organizer']; m.openDecisions = [];
  assert.match(validateAuctionAdmission(m).join(';'), /ROLE_MATRIX_INCOMPLETE/);
  assert.match(validateAuctionAdmission(m).join(';'), /MISSING_BUSINESS_DECISIONS/);
});
test('unsupported external approval link is rejected', () => {
  const m = copy(); m.approval.ownerReference = 'https://untrusted.test/approved';
  assert.match(validateAuctionAdmission(m).join(';'), /UNTRUSTED_EVIDENCE_REFERENCE/);
});
test('duplicate workflow IDs cannot bypass design-only policy', () => {
  const m = copy(); m.workflows[1].id = m.workflows[0].id;
  assert.match(validateAuctionAdmission(m).join(';'), /WORKFLOW_MUST_REMAIN_DESIGN_ONLY/);
});
