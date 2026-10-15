import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  WHATSAPP_POLICY_REVIEW_1011,
  WHATSAPP_USE_CASES_1011,
  evaluateWhatsAppUseCase1011
} from '../tools/hipico-whatsapp-web-bridge/src/policy-review-v1011.mjs';
import {
  SOURCE_AUTO_REPLY_POLICY_NO_GO,
  SOURCE_POLICY_REVIEW,
  evaluateSourceAutoReplyPolicy
} from '../tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs';

test('#1011: policy sources, dates and unverified technical permissions are visible', () => {
  const review = WHATSAPP_POLICY_REVIEW_1011;
  assert.equal(review.reviewedAt, '2026-10-15');
  assert.equal(review.sourceAutomatedWrites, 'NO_GO');
  assert.equal(review.groupApiAccountEligibility, 'NOT_VERIFIED');
  assert.equal(review.officialGroupsApiDetails, 'NOT_VERIFIED_RATE_LIMITED');
  assert.equal(review.legalReview, 'PENDING');
  assert.ok(review.references.messagingPolicy.startsWith('https://business.whatsapp.com/policy/'));
  assert.ok(review.references.solutionTerms.startsWith('https://www.whatsapp.com/legal/'));
  assert.ok(review.references.groupsApi.startsWith('https://developers.facebook.com/'));
  assert.equal(SOURCE_POLICY_REVIEW.snapshot, review.id);
  assert.equal(SOURCE_POLICY_REVIEW.reviewedAt, review.reviewedAt);
});

test('#1011: every known production case fails closed, unknown cases cannot turn GO', () => {
  assert.ok(WHATSAPP_USE_CASES_1011.length >= 8);
  for (const useCase of WHATSAPP_USE_CASES_1011) {
    const result = evaluateWhatsAppUseCase1011(useCase, {
      officialTransport: true, verifiedWaba: true, businessApproved: true,
      groupPermission: true, consent: true, ageGateConfirmed: true,
      policyReviewId: 'claimed-approval', legalReview: 'GO'
    });
    assert.notEqual(result.decision, 'GO');
    assert.equal(result.productionSourceWritingAuthorized, false);
    assert.equal(result.officialGroupsApiEligible, false);
  }
  const unknown = evaluateWhatsAppUseCase1011('UNRECOGNIZED', { approved: true });
  assert.equal(unknown.decision, 'BLOCKED');
  assert.equal(unknown.reason, 'UNKNOWN_USE_CASE');
  assert.equal(unknown.productionSourceWritingAuthorized, false);
});

test('#1011: a synthetic LAB case is not an authorization to write SOURCE', () => {
  assert.equal(evaluateWhatsAppUseCase1011('LAB_SYNTHETIC').decision, 'BLOCKED');
  assert.equal(evaluateWhatsAppUseCase1011('LAB_SYNTHETIC', {
    synthetic: true
  }).decision, 'BLOCKED');
  assert.equal(evaluateWhatsAppUseCase1011('LAB_SYNTHETIC', {
    labOwnerAuthorized: true
  }).decision, 'BLOCKED');
  const lab = evaluateWhatsAppUseCase1011('LAB_SYNTHETIC', {
    synthetic: true, labOwnerAuthorized: true
  });
  assert.equal(lab.decision, 'LAB_ONLY');
  assert.equal(lab.productionSourceWritingAuthorized, false);
  assert.equal(lab.independentRuntimeIdentityGuardRequired, true);
});

test('#1011: runtime SOURCE gate is still impossible to bypass with fake evidence', () => {
  const fake = {
    transportAdapter: 'cloud-api',
    sourceAutoReplyEnabled: true,
    sourcePolicyReviewId: 'claimed-approved',
    sourceLicenseEvidenceRef: 'claimed-license',
    metaPermissionEvidenceRef: 'claimed-meta',
    sourceAgeGateConfirmed: true
  };
  const result = evaluateSourceAutoReplyPolicy(fake);
  assert.equal(result.status, 'NO_GO');
  assert.equal(result.policyCode, SOURCE_AUTO_REPLY_POLICY_NO_GO);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY'));
  assert.equal(result.caseReview.productionSourceWritingAuthorized, false);
});

test('#1011: operator CLI exposes blocked reason without group identifiers or secrets', () => {
  const secret = 'PRIVATE_VALUE_NOT_TO_EMIT_123456';
  const groupId = '120363111111111111-1234567890@g.us';
  const script = 'tools/hipico-whatsapp-web-bridge/src/source-policy-status.mjs';
  const executed = spawnSync(process.execPath, [script], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
    env: {
      ...process.env, HIPICO_GROUP_BRIDGE_TOKEN: secret,
      HIPICO_SOURCE_GROUP_ID: groupId,
      HIPICO_SOURCE_AUTO_REPLY_ENABLED: 'true'
    }
  });
  assert.equal(executed.status, 2, executed.stderr || executed.stdout);
  const result = JSON.parse(executed.stdout);
  assert.equal(result.sourcePolicy.status, 'NO_GO');
  assert.equal(result.sourcePolicy.reviewedAt, '2026-10-15');
  assert.equal(result.sourcePolicy.officialGroupsApiDetails, 'NOT_VERIFIED_RATE_LIMITED');
  assert.ok(result.useCaseEligibility.every((item) => item.productionSourceWritingAuthorized === false));
  assert.ok(result.useCaseEligibility.every((item) => item.decision !== 'GO'));
  assert.equal(executed.stdout.includes(secret), false);
  assert.equal(executed.stdout.includes(groupId), false);
});
