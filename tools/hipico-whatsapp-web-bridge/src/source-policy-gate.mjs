import { resolveTransportCapabilities } from './transport-capabilities.mjs';
import { WHATSAPP_POLICY_REVIEW_1011, evaluateWhatsAppUseCase1011 } from './policy-review-v1011.mjs';

export const SOURCE_AUTO_REPLY_POLICY_NO_GO = 'SOURCE_AUTO_REPLY_POLICY_NO_GO';
export const SOURCE_POLICY_SNAPSHOT = WHATSAPP_POLICY_REVIEW_1011.id;
export const SOURCE_POLICY_REFERENCE = WHATSAPP_POLICY_REVIEW_1011.references.messengerTerms;

export const SOURCE_POLICY_REVIEW = Object.freeze({
  snapshot: SOURCE_POLICY_SNAPSHOT,
  status: 'NO_GO',
  reviewedAt: WHATSAPP_POLICY_REVIEW_1011.reviewedAt,
  nextReviewBy: WHATSAPP_POLICY_REVIEW_1011.nextReviewBy,
  messengerAuthorization: WHATSAPP_POLICY_REVIEW_1011.messengerAuthorization,
  selectedChannel: WHATSAPP_POLICY_REVIEW_1011.selectedChannel,
  businessProductsSelected: WHATSAPP_POLICY_REVIEW_1011.businessProductsSelected,
  legalReview: WHATSAPP_POLICY_REVIEW_1011.legalReview,
  policyReference: SOURCE_POLICY_REFERENCE,
  reason: 'MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED'
});

export function evaluateSourceAutoReplyPolicy(config = {}, capabilities = resolveTransportCapabilities(config.transportAdapter)) {
  const requested = Boolean(config.sourceAutoReplyEnabled);
  if (!requested) {
    return Object.freeze({
      requested: false,
      eligible: false,
      status: 'DISABLED',
      policyCode: SOURCE_AUTO_REPLY_POLICY_NO_GO,
      snapshot: SOURCE_POLICY_SNAPSHOT,
      policyReference: SOURCE_POLICY_REFERENCE,
      transport: capabilities.id,
      officialTransport: capabilities.official,
      implementedTransport: capabilities.implemented,
      reasons: Object.freeze(['SOURCE_AUTO_REPLY_DISABLED'])
    });
  }

  const reasons = ['MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED'];
  if (!capabilities.official) reasons.push('UNOFFICIAL_TRANSPORT');
  if (!capabilities.implemented) reasons.push('TRANSPORT_NOT_IMPLEMENTED');
  if (!String(config.sourcePolicyReviewId || '').trim()) reasons.push('POLICY_REVIEW_EVIDENCE_MISSING');

  return Object.freeze({
    requested: true,
    eligible: false,
    status: 'NO_GO',
    policyCode: SOURCE_AUTO_REPLY_POLICY_NO_GO,
    snapshot: SOURCE_POLICY_SNAPSHOT,
    policyReference: SOURCE_POLICY_REFERENCE,
    transport: capabilities.id,
    officialTransport: capabilities.official,
    implementedTransport: capabilities.implemented,
    reasons: Object.freeze(reasons),
    caseReview: evaluateWhatsAppUseCase1011('SOURCE_RECREATIONAL_GENERAL_INFORMATION')
  });
}

export function policyDiagnostic(config = {}) {
  const capabilities = resolveTransportCapabilities(config.transportAdapter);
  const policy = evaluateSourceAutoReplyPolicy(config, capabilities);
  return Object.freeze({
    transport: capabilities,
    sourcePolicy: policy
  });
}
