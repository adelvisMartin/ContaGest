import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const blockedReasons = Object.freeze([
  'OWNER_APPROVAL_MISSING',
  'MONEY_AUTHORITY_NOT_APPROVED',
  'FISCAL_LEGAL_REVIEW_MISSING',
  'TENANT_RBAC_PRIVACY_REVIEW_MISSING',
  'REAL_MONEY_OPERATIONS_NOT_AUTHORIZED',
]);

const safeSource = (value) =>
  typeof value === 'string' && value.length > 0 && /^https:\/\/github\.com\/adelvisMartin\/ContaGest\/(issues|pull)\/\d+(?:#.+)?$/.test(value);

export function validateAuctionAdmission(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['INVALID_MANIFEST'];
  if (manifest.schemaVersion !== 1 || manifest.issue !== 1010) problems.push('WRONG_AUTHORITY');
  if (!/^[a-f\d]{40}$/.test(manifest.baselineSha ?? '')) problems.push('INVALID_SHA');
  if (manifest.sourceReuse !== 'NONE') problems.push('UNAUTHORIZED_SOURCE_REUSE');
  if (manifest.businessCase !== 'UNCONFIRMED' || manifest.decision !== 'BLOCKED') problems.push('PREMATURE_GO');
  if (manifest.approval?.status !== 'PENDING_OWNER') problems.push('APPROVAL_NOT_ESTABLISHED');
  for (const key of ['ownerReference','moneyAuthorityReference','fiscalLegalReference','rbacDesignReference','retentionPrivacyReference']) {
    if (manifest.approval?.[key] != null && !safeSource(manifest.approval[key])) problems.push('UNTRUSTED_EVIDENCE_REFERENCE:' + key);
  }
  const separation = manifest.separation ?? {};
  if (separation.raceBetting !== 'EXCLUDED' || separation.realWhatsApp !== 'EXCLUDED' ||
      separation.existingParticipantWallet !== 'EXCLUDED' ||
      separation.existingHipicoLedger !== 'PRESERVE_AUTHORITY' ||
      separation.realMoneyActions !== 'BLOCKED') problems.push('FINANCIAL_OR_CHANNEL_AUTHORITY_VIOLATION');
  const roles = manifest.roles;
  const requiredRoles = ['organizer','consignor','auctioneer','cashier','approved_buyer','auditor'];
  if (!Array.isArray(roles) || roles.length !== new Set(roles).size || requiredRoles.some(role => !roles.includes(role))) problems.push('ROLE_MATRIX_INCOMPLETE');
  const flows = manifest.workflows;
  const requiredFlows = ['auction-event','catalog-lot','bid-award','settlement'];
  if (!Array.isArray(flows) || flows.length !== requiredFlows.length ||
      requiredFlows.some(id => flows.filter(row => row?.id === id).length !== 1) ||
      flows.some(row => row?.status !== (row.id === 'settlement' ? 'BLOCKED_ON_MONEY_AUTHORITY' : 'DESIGN_ONLY')))
    problems.push('WORKFLOW_MUST_REMAIN_DESIGN_ONLY');
  if (!Array.isArray(manifest.openDecisions) || manifest.openDecisions.length < 10 ||
      manifest.openDecisions.length !== new Set(manifest.openDecisions).size) problems.push('MISSING_BUSINESS_DECISIONS');
  return problems;
}

export function evaluateAuctionAdmission(manifest) {
  const problems = validateAuctionAdmission(manifest);
  return Object.freeze({
    issue: 1010,
    status: 'BLOCKED',
    canCreateSchema: false,
    canAcceptBids: false,
    canSettle: false,
    canUseRealWhatsApp: false,
    reasons: problems.length ? Object.freeze(problems) : blockedReasons,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = new URL('../config/hipico-auction-admission-v1010.json', import.meta.url);
  try {
    const state = evaluateAuctionAdmission(JSON.parse(readFileSync(path, 'utf8')));
    process.stdout.write(JSON.stringify(state) + '\n');
    if (validateAuctionAdmission(JSON.parse(readFileSync(path, 'utf8'))).length) process.exitCode = 1;
  } catch {
    console.error('AUCTION_ADMISSION_MANIFEST_UNREADABLE');
    process.exitCode = 1;
  }
}
