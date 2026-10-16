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

test('#1011: owner profile, Messenger terms and excluded Business products are explicit', () => {
  const review = WHATSAPP_POLICY_REVIEW_1011;
  assert.equal(review.reviewedAt, '2026-10-15');
  assert.equal(review.sourceAutomatedWrites, 'NO_GO');
  assert.equal(review.selectedChannel, 'WHATSAPP_MESSENGER_NORMAL');
  assert.equal(review.messengerAutomatedMessaging, 'RESTRICTED_UNLESS_AUTHORIZED');
  assert.equal(review.messengerThirdPartyAgents, 'DIRECT_AGENT_CHAT_ONLY_LIMITED_COUNTRIES');
  assert.equal(review.thirdPartyAgentCanAccessGroupChats, false);
  assert.equal(review.thirdPartyAgentAvailability, 'LIMITED_COUNTRIES_NOT_VERIFIED');
  assert.equal(review.messengerAuthorization, 'NOT_VERIFIED');
  assert.equal(review.businessProductsSelected, false);
  assert.deepEqual(review.ownerUseCaseProfile, {
    group: 'PRIVATE_FRIENDS',
    activity: 'RECREATIONAL_HORSE_RACING',
    realMoney: false,
    deposits: false,
    payments: false,
    withdrawals: false,
    redeemablePrizes: false,
    economicEffect: false
  });
  assert.equal(review.legalReview, 'PENDING_FOR_MESSENGER_AUTOMATION');
  assert.ok(review.references.messengerTerms.startsWith('https://www.whatsapp.com/legal/terms-of-service'));
  assert.ok(review.references.thirdPartyAgentTerms.startsWith('https://www.whatsapp.com/legal/third-party-agents-terms'));
  assert.ok(review.references.thirdPartyAgentHelp.startsWith('https://faq.whatsapp.com/1050934623978152'));
  assert.equal(SOURCE_POLICY_REVIEW.snapshot, review.id);
  assert.equal(SOURCE_POLICY_REVIEW.reviewedAt, review.reviewedAt);
  assert.equal(SOURCE_POLICY_REVIEW.policyReference, review.references.messengerTerms);
});

test('#1011: SOURCE auto-replies remain blocked while manual sharing requires a person', () => {
  const approvedLookingContext = {
    officialTransport: true, verifiedWaba: true, businessApproved: true,
    groupPermission: true, consent: true, ageGateConfirmed: true,
    messengerAuthorization: 'claimed-GO', channel: 'SOURCE'
  };
  for (const useCase of [
    'SOURCE_RECREATIONAL_PICKS',
    'SOURCE_RECREATIONAL_RESULTS',
    'SOURCE_RECREATIONAL_GENERAL_INFORMATION'
  ]) {
    const result = evaluateWhatsAppUseCase1011(useCase, approvedLookingContext);
    assert.equal(result.decision, 'NO_GO');
    assert.equal(result.reason, 'MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED');
    assert.equal(result.productionSourceWritingAuthorized, false);
    assert.equal(result.selectedChannel, 'WHATSAPP_MESSENGER_NORMAL');
  }
  const financial = evaluateWhatsAppUseCase1011('SOURCE_FINANCIAL_INFORMATION');
  assert.equal(financial.decision, 'NO_GO');
  assert.equal(financial.reason, 'FINANCIAL_DATA_OUT_OF_RECREATIONAL_GROUP_SCOPE');
  const manual = evaluateWhatsAppUseCase1011('SOURCE_MANUAL_SUGGESTION');
  assert.equal(manual.decision, 'HUMAN_ACTION_REQUIRED');
  assert.equal(manual.productionSourceWritingAuthorized, false);
  const business = evaluateWhatsAppUseCase1011('BUSINESS_PLATFORM_OR_GROUPS_API');
  assert.equal(business.decision, 'NOT_APPLICABLE');
  assert.equal(business.businessProductsSelected, false);
});

test('#1011: every configured case and unknown case cannot authorize automated SOURCE', () => {
  assert.ok(WHATSAPP_USE_CASES_1011.length >= 7);
  for (const useCase of WHATSAPP_USE_CASES_1011) {
    const result = evaluateWhatsAppUseCase1011(useCase, {
      officialTransport: true, verifiedWaba: true, businessApproved: true,
      groupPermission: true, consent: true, ageGateConfirmed: true,
      policyReviewId: 'claimed-approval', messengerAuthorization: 'claimed-GO'
    });
    assert.equal(result.productionSourceWritingAuthorized, false);
    assert.notEqual(result.decision, 'GO');
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
    channel: 'LAB', synthetic: true, labOwnerAuthorized: true
  });
  assert.equal(lab.decision, 'LAB_ONLY');
  assert.equal(evaluateWhatsAppUseCase1011('LAB_SYNTHETIC', {
    channel: 'SOURCE', synthetic: true, labOwnerAuthorized: true
  }).decision, 'BLOCKED');
  assert.equal(evaluateWhatsAppUseCase1011('LAB_SYNTHETIC', null).decision, 'BLOCKED');
  assert.equal(lab.productionSourceWritingAuthorized, false);
  assert.equal(lab.independentRuntimeIdentityGuardRequired, true);
});

test('#1011: runtime SOURCE gate is still impossible to bypass with fake evidence', () => {
  const fake = {
    transportAdapter: 'cloud-api',
    sourceAutoReplyEnabled: true,
    sourcePolicyReviewId: 'claimed-approved',
    sourceLicenseEvidenceRef: 'not-applicable',
    metaPermissionEvidenceRef: 'claimed-permission',
    sourceAgeGateConfirmed: true
  };
  const result = evaluateSourceAutoReplyPolicy(fake);
  assert.equal(result.status, 'NO_GO');
  assert.equal(result.policyCode, SOURCE_AUTO_REPLY_POLICY_NO_GO);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED'));
  assert.equal(result.caseReview.productionSourceWritingAuthorized, false);
});

test('#1011: operator CLI exposes the Messenger gate without identifiers or secrets', () => {
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
  assert.equal(result.sourcePolicy.selectedChannel, 'WHATSAPP_MESSENGER_NORMAL');
  assert.equal(result.sourcePolicy.messengerAuthorization, 'NOT_VERIFIED');
  assert.equal(result.sourcePolicy.businessProductsSelected, false);
  assert.ok(result.useCaseEligibility.every((item) => item.productionSourceWritingAuthorized === false));
  assert.ok(result.useCaseEligibility.every((item) => item.decision !== 'GO'));
  assert.equal(executed.stdout.includes(secret), false);
  assert.equal(executed.stdout.includes(groupId), false);
});
