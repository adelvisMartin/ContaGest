import { loadRuntimeConfig, VERSION } from './runtime-config.mjs';
import { policyDiagnostic, SOURCE_POLICY_REVIEW } from './source-policy-gate.mjs';
import { WHATSAPP_USE_CASES_1011, evaluateWhatsAppUseCase1011 } from './policy-review-v1011.mjs';
import { sourceReadPolicyStatus } from './source-read-policy-gate.mjs';

const config = loadRuntimeConfig(process.env, process.cwd());
const { transport, sourcePolicy } = policyDiagnostic(config);

const payload = {
  version: VERSION,
  runtimeMode: config.runtimeMode,
  transport: {
    id: transport.id,
    official: transport.official,
    implemented: transport.implemented,
    sourceRead: transport.sourceRead,
    labSend: transport.labSend,
    groupSend: transport.groupSend,
    receipts: transport.receipts,
    media: transport.media
  },
  lab: {
    sendRequested: config.labSendEnabled,
    inputRequested: config.labTestInputEnabled,
    technicallyAvailable: transport.implemented && transport.labSend
  },
  sourceReadPolicy: sourceReadPolicyStatus(),
  sourcePolicy: {
    requested: sourcePolicy.requested,
    eligible: sourcePolicy.eligible,
    status: sourcePolicy.status,
    policyCode: sourcePolicy.policyCode,
    snapshot: sourcePolicy.snapshot,
    policyReference: sourcePolicy.policyReference,
    reasons: sourcePolicy.reasons,
    reviewedAt: SOURCE_POLICY_REVIEW.reviewedAt,
    nextReviewBy: SOURCE_POLICY_REVIEW.nextReviewBy,
    selectedChannel: SOURCE_POLICY_REVIEW.selectedChannel,
    businessProductsSelected: SOURCE_POLICY_REVIEW.businessProductsSelected,
    messengerAuthorization: SOURCE_POLICY_REVIEW.messengerAuthorization,
    legalReview: SOURCE_POLICY_REVIEW.legalReview
  },
  useCaseEligibility: WHATSAPP_USE_CASES_1011.map((useCase) => evaluateWhatsAppUseCase1011(useCase))
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
// SOURCE automation is blocked even when the source-send switch is off.
process.exitCode = 2;
