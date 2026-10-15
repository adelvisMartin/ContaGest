import { loadRuntimeConfig, VERSION } from './runtime-config.mjs';
import { policyDiagnostic, SOURCE_POLICY_REVIEW } from './source-policy-gate.mjs';
import { WHATSAPP_USE_CASES_1011, evaluateWhatsAppUseCase1011 } from './policy-review-v1011.mjs';

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
    groupApiAccountEligibility: SOURCE_POLICY_REVIEW.groupApiAccountEligibility,
    officialGroupsApiDetails: SOURCE_POLICY_REVIEW.officialGroupsApiDetails,
    legalReview: SOURCE_POLICY_REVIEW.legalReview
  },
  useCaseEligibility: WHATSAPP_USE_CASES_1011.map((useCase) => evaluateWhatsAppUseCase1011(useCase))
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exitCode = sourcePolicy.requested && !sourcePolicy.eligible ? 2 : 0;
