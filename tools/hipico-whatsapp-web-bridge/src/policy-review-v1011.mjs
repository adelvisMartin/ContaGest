/**
 * #1011 — dated Messenger policy/product decision snapshot. This is NOT a
 * permit to send. Runtime authority remains source-policy-gate.mjs and LAB
 * identity/config gates. Store no group IDs, phone numbers, sessions, tokens
 * or private account facts.
 */
export const WHATSAPP_POLICY_REVIEW_1011 = Object.freeze({
  id: 'WHATSAPP_MESSENGER_POLICY_2026-10-15',
  reviewedAt: '2026-10-15',
  status: 'NO_GO',
  selectedChannel: 'WHATSAPP_MESSENGER_NORMAL',
  sourceAutomatedWrites: 'NO_GO',
  messengerAutomatedMessaging: 'RESTRICTED_UNLESS_AUTHORIZED',
  messengerThirdPartyAgents: 'DIRECT_AGENT_CHAT_ONLY_LIMITED_COUNTRIES',
  thirdPartyAgentCanAccessGroupChats: false,
  thirdPartyAgentAvailability: 'LIMITED_COUNTRIES_NOT_VERIFIED',
  businessProductsSelected: false,
  ownerUseCaseProfile: Object.freeze({
    group: 'PRIVATE_FRIENDS',
    activity: 'RECREATIONAL_HORSE_RACING',
    realMoney: false,
    deposits: false,
    payments: false,
    withdrawals: false,
    redeemablePrizes: false,
    economicEffect: false
  }),
  officialPolicyChecked: true,
  messengerAuthorization: 'NOT_VERIFIED',
  groupApiAccountEligibility: 'NOT_APPLICABLE_BUSINESS_PRODUCTS_EXCLUDED',
  officialGroupsApiDetails: 'NOT_APPLICABLE_BUSINESS_PRODUCTS_EXCLUDED',
  legalReview: 'PENDING_FOR_MESSENGER_AUTOMATION',
  nextReviewBy: '2026-11-14',
  references: Object.freeze({
    messengerTerms: 'https://www.whatsapp.com/legal/terms-of-service?lang=es',
    thirdPartyAgentTerms: 'https://www.whatsapp.com/legal/third-party-agents-terms',
    thirdPartyAgentHelp: 'https://faq.whatsapp.com/1050934623978152'
  })
});

/**
 * The owner-confirmed group is recreational and has no real-money or other
 * economic effect. SOURCE automation is still blocked because the selected
 * consumer Messenger terms restrict automated/non-personal use absent
 * authorization. LAB/manual suggestion cases do not authorize source sends.
 */
const REVIEW_CASES = Object.freeze({
  SOURCE_RECREATIONAL_PICKS: Object.freeze({ decision:'NO_GO', reason:'MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED' }),
  SOURCE_RECREATIONAL_RESULTS: Object.freeze({ decision:'NO_GO', reason:'MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED' }),
  SOURCE_RECREATIONAL_GENERAL_INFORMATION: Object.freeze({ decision:'NO_GO', reason:'MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED' }),
  SOURCE_FINANCIAL_INFORMATION: Object.freeze({ decision:'NO_GO', reason:'FINANCIAL_DATA_OUT_OF_RECREATIONAL_GROUP_SCOPE' }),
  SOURCE_MANUAL_SUGGESTION: Object.freeze({ decision:'HUMAN_ACTION_REQUIRED', reason:'USER_MUST_REVIEW_AND_SHARE_MANUALLY' }),
  BUSINESS_PLATFORM_OR_GROUPS_API: Object.freeze({ decision:'NOT_APPLICABLE', reason:'BUSINESS_PRODUCTS_EXCLUDED_BY_OWNER' }),
  LAB_SYNTHETIC: Object.freeze({ decision:'BLOCKED', reason:'LAB_AUTHORIZATION_NOT_PROVEN' })
});

export const WHATSAPP_USE_CASES_1011 = Object.freeze(Object.keys(REVIEW_CASES));

export function evaluateWhatsAppUseCase1011(useCase, context = {}) {
  const key = typeof useCase === 'string' ? useCase : '';
  const rule = Object.hasOwn(REVIEW_CASES, key)
    ? REVIEW_CASES[key]
    : Object.freeze({ decision:'BLOCKED', reason:'UNKNOWN_USE_CASE' });
  const isLab = key === 'LAB_SYNTHETIC';
  const labAuthorized = context?.channel === 'LAB' && context?.synthetic === true && context?.labOwnerAuthorized === true;
  const decision = isLab && labAuthorized ? 'LAB_ONLY' : rule.decision;
  const reason = isLab && labAuthorized ? 'SYNTHETIC_LAB_SUBJECT_TO_RUNTIME_GATES' : rule.reason;
  return Object.freeze({
    reviewId: WHATSAPP_POLICY_REVIEW_1011.id,
    useCase: Object.hasOwn(REVIEW_CASES, key) ? key : 'UNKNOWN',
    decision,
    reason,
    productionSourceWritingAuthorized: false,
    selectedChannel: WHATSAPP_POLICY_REVIEW_1011.selectedChannel,
    businessProductsSelected: WHATSAPP_POLICY_REVIEW_1011.businessProductsSelected,
    messengerAuthorization: WHATSAPP_POLICY_REVIEW_1011.messengerAuthorization,
    independentRuntimeIdentityGuardRequired: isLab
  });
}
