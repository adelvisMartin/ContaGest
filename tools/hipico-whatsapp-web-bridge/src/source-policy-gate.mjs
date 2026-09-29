import { resolveTransportCapabilities } from './transport-capabilities.mjs';

export const SOURCE_AUTO_REPLY_POLICY_NO_GO = 'SOURCE_AUTO_REPLY_POLICY_NO_GO';
export const SOURCE_POLICY_SNAPSHOT = 'WHATSAPP_BUSINESS_POLICY_2026-09-29';
export const SOURCE_POLICY_REFERENCE = 'https://business.whatsapp.com/policy/';

export const SOURCE_POLICY_REVIEW = Object.freeze({
  snapshot: SOURCE_POLICY_SNAPSHOT,
  status: 'NO_GO',
  reviewedAt: '2026-09-29',
  policyReference: SOURCE_POLICY_REFERENCE,
  reason: 'REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY'
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

  const reasons = ['REAL_MONEY_GAMBLING_PROHIBITED_BY_WHATSAPP_BUSINESS_POLICY'];
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
    evidence: Object.freeze({
      reviewId: String(config.sourcePolicyReviewId || '').trim() || null,
      licenseRef: String(config.sourceLicenseEvidenceRef || '').trim() || null,
      metaPermissionRef: String(config.metaPermissionEvidenceRef || '').trim() || null,
      ageGateConfirmed: Boolean(config.sourceAgeGateConfirmed)
    }),
    reasons: Object.freeze(reasons)
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
