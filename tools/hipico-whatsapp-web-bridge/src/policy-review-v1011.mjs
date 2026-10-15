/**
 * #1011 — dated policy/product decision snapshot. This file is NOT a permit to send.
 * Runtime authority remains source-policy-gate.mjs and LAB identity/config gates.
 * No group IDs, WhatsApp numbers, sessions, tokens or private account facts are kept.
 */
export const WHATSAPP_POLICY_REVIEW_1011 = Object.freeze({
  id: 'WHATSAPP_BUSINESS_POLICY_2026-10-15',
  reviewedAt: '2026-10-15',
  status: 'NO_GO',
  sourceAutomatedWrites: 'NO_GO',
  officialPolicyChecked: true,
  groupApiAccountEligibility: 'NOT_VERIFIED',
  officialGroupsApiDetails: 'NOT_VERIFIED_RATE_LIMITED',
  merchantAndTerritoryReview: 'NOT_VERIFIED',
  actualGroupOwnershipAndConsent: 'NOT_VERIFIED',
  legalReview: 'PENDING',
  nextReviewBy: '2026-11-14',
  references: Object.freeze({
    messagingPolicy: 'https://business.whatsapp.com/policy/preview?lang=es_LA',
    solutionTerms: 'https://www.whatsapp.com/legal/business-solution-terms',
    metaBusinessTerms: 'https://www.whatsapp.com/legal/meta-terms-whatsapp-business?lang=es',
    groupsApi: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/',
    thirdPartyAgentTerms: 'https://www.whatsapp.com/legal/third-party-agents-terms'
  })
});

/**
 * Cases are intentionally conservative. SOURCE refers to the existing
 * real-money betting-related group. "Informational" content in that context
 * does not establish an exception to the platform restriction.
 *
 * The snapshot never returns GO for WhatsApp production. An authorized LAB
 * classification only means it may be tested under independent runtime guards.
 */
const REVIEW_CASES = Object.freeze({
  SOURCE_WAGERS: Object.freeze({ decision:'NO_GO', reason:'REAL_MONEY_GAMBLING_RESTRICTED' }),
  SOURCE_BALANCES: Object.freeze({ decision:'NO_GO', reason:'REAL_MONEY_GAMBLING_CONTEXT' }),
  SOURCE_RESULTS: Object.freeze({ decision:'NO_GO', reason:'REAL_MONEY_GAMBLING_CONTEXT' }),
  SOURCE_GENERAL_INFORMATION: Object.freeze({ decision:'NO_GO', reason:'SOURCE_CASE_NOT_INDEPENDENTLY_APPROVED' }),
  PRIVATE_INFORMATIONAL_ONE_TO_ONE: Object.freeze({ decision:'BLOCKED', reason:'ACCOUNT_CONSENT_AND_USE_CASE_NOT_VERIFIED' }),
  OFFICIAL_GROUPS_API_TEST: Object.freeze({ decision:'BLOCKED', reason:'OFFICIAL_GROUPS_API_AND_WABA_ELIGIBILITY_NOT_VERIFIED' }),
  THIRD_PARTY_AI_AGENT: Object.freeze({ decision:'BLOCKED', reason:'AI_PROVIDER_TERMS_AND_DATA_PROCESSING_REVIEW_PENDING' }),
  LAB_SYNTHETIC: Object.freeze({ decision:'BLOCKED', reason:'LAB_AUTHORIZATION_NOT_PROVEN' })
});

export const WHATSAPP_USE_CASES_1011 = Object.freeze(Object.keys(REVIEW_CASES));

export function evaluateWhatsAppUseCase1011(useCase, context = {}) {
  const key = typeof useCase === 'string' ? useCase : '';
  const rule = Object.hasOwn(REVIEW_CASES, key)
    ? REVIEW_CASES[key]
    : Object.freeze({ decision:'BLOCKED', reason:'UNKNOWN_USE_CASE' });
  const isLab = key === 'LAB_SYNTHETIC';
  const labAuthorized = context.synthetic === true && context.labOwnerAuthorized === true;
  const decision = isLab && labAuthorized ? 'LAB_ONLY' : rule.decision;
  const reason = isLab && labAuthorized ? 'SYNTHETIC_LAB_SUBJECT_TO_RUNTIME_GATES' : rule.reason;
  return Object.freeze({
    reviewId: WHATSAPP_POLICY_REVIEW_1011.id,
    useCase: Object.hasOwn(REVIEW_CASES, key) ? key : 'UNKNOWN',
    decision,
    reason,
    productionSourceWritingAuthorized: false,
    officialGroupsApiEligible: false,
    independentRuntimeIdentityGuardRequired: isLab
  });
}
